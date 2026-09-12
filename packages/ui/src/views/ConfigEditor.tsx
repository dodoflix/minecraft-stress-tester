import { dump, load } from "js-yaml";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteConfig,
  type FormField,
  getConfig,
  getSchema,
  listConfigs,
  saveConfig,
  type ValidationResult,
  validateConfig,
} from "../api.ts";
import { CodeEditor } from "../components/CodeEditor.tsx";
import { SchemaForm } from "../components/SchemaForm.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { setPath } from "../lib/utils.ts";

const STARTER =
  "authorized: false\ntarget:\n  host: 127.0.0.1\n  port: 25565\ndriver: light\nramp:\n  count: 10\n";

function toYaml(obj: unknown): string {
  try {
    return dump(obj, { sortKeys: false });
  } catch {
    return "";
  }
}

export function ConfigEditor() {
  const [fields, setFields] = useState<FormField[]>([]);
  const [obj, setObj] = useState<Record<string, unknown>>({});
  const [text, setText] = useState(STARTER);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [configs, setConfigs] = useState<string[]>([]);
  const [name, setName] = useState("run.yaml");
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshConfigs = useCallback(() => {
    listConfigs()
      .then(setConfigs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    getSchema()
      .then((s) => setFields(s.fields))
      .catch(() => {});
    refreshConfigs();
    try {
      setObj((load(STARTER) as Record<string, unknown>) ?? {});
    } catch {
      // starter is valid; ignore
    }
  }, [refreshConfigs]);

  // Debounced validation whenever the YAML text changes.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      validateConfig(text, ".yaml")
        .then(setResult)
        .catch((e) => setResult({ valid: false, errors: [String(e)] }));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text]);

  function onFormChange(path: string, value: unknown) {
    const next = setPath(obj, path, value);
    setObj(next);
    setText(toYaml(next));
  }

  function onYamlChange(next: string) {
    setText(next);
    try {
      setObj((load(next) as Record<string, unknown>) ?? {});
    } catch {
      // keep the last valid object while the YAML is mid-edit
    }
  }

  async function onLoad(file: string) {
    setMsg(null);
    try {
      const c = await getConfig(file);
      setName(file);
      onYamlChange(c.content);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSave() {
    setMsg(null);
    try {
      const r = await saveConfig(name, text);
      if (r.valid) {
        setMsg(`Saved ${name}`);
        refreshConfigs();
      } else {
        setMsg((r.errors ?? ["invalid config"]).join("; "));
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDelete(file: string) {
    try {
      await deleteConfig(file);
      refreshConfigs();
    } catch {
      // ignore
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-[220px]" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" onClick={onSave}>
            Save
          </Button>
          {result &&
            (result.valid ? (
              <Badge variant="secondary">valid</Badge>
            ) : (
              <Badge variant="destructive">{result.errors?.length ?? 0} error(s)</Badge>
            ))}
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>

        {result && !result.valid && result.errors && (
          <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <Tabs defaultValue="form">
          <TabsList>
            <TabsTrigger value="form">Form</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
          </TabsList>
          <TabsContent value="form">
            <SchemaForm fields={fields} value={obj} onChange={onFormChange} />
          </TabsContent>
          <TabsContent value="yaml">
            <CodeEditor value={text} onChange={onYamlChange} language="yaml" />
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Saved configs</h3>
        {configs.length === 0 && <p className="text-sm text-muted-foreground">None saved.</p>}
        {configs.map((c) => (
          <div key={c} className="flex items-center justify-between gap-1 rounded-md border p-1.5 text-sm">
            <button type="button" className="truncate text-left font-mono" onClick={() => onLoad(c)}>
              {c}
            </button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(c)}>
              x
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
