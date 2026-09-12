import { useRef, useState } from "react";
import { runScript, type ScriptRunResult, validateScript } from "../api.ts";
import { CodeEditor } from "../components/CodeEditor.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Switch } from "../components/ui/switch.tsx";

const STARTER = `// Runs in a sandboxed isolate. Only the Bot API is available; every call is async.
// No fs, net, env, or require. console.log streams back here.
const pos = await bot.position();
console.log("spawned at", pos && pos.x, pos && pos.y, pos && pos.z);
await bot.chat("hello from a sandboxed script");
bot.on("chat", (m) => console.log("chat:", m.username, m.message));
await sleep(3000);
`;

export function Scripts() {
  const [code, setCode] = useState(STARTER);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(25565);
  const [authorized, setAuthorized] = useState(false);
  const [result, setResult] = useState<ScriptRunResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onValidate() {
    setStatus(null);
    const r = await validateScript(code);
    setStatus(r.ok ? "Syntax OK" : `Error: ${r.error}`);
  }

  async function onRun() {
    setBusy(true);
    setResult(null);
    setStatus(null);
    try {
      setResult(await runScript({ code, target: { host, port }, authorized }));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onExport() {
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "script.js";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCode);
    e.target.value = "";
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            Import
          </Button>
          <input ref={fileInput} type="file" accept=".js,.mjs,.ts,.txt" hidden onChange={onImport} />
          <Button size="sm" variant="outline" onClick={onExport}>
            Export
          </Button>
          <Button size="sm" variant="secondary" onClick={onValidate}>
            Validate
          </Button>
          <Button size="sm" onClick={onRun} disabled={busy || !authorized || !host}>
            {busy ? "Running..." : "Run"}
          </Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
        <CodeEditor value={code} onChange={setCode} language="javascript" />
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Run target</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-host">Host</Label>
              <Input id="s-host" value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-port">Port</Label>
              <Input
                id="s-port"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch id="s-auth" checked={authorized} onCheckedChange={setAuthorized} />
              <Label htmlFor="s-auth">I am authorized to test this target</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="flex flex-col gap-2">
                <Badge variant={result.ok ? "secondary" : "destructive"}>
                  {result.ok ? "finished" : "error"}
                </Badge>
                {result.error && <p className="text-sm text-destructive">{result.error}</p>}
                <pre className="max-h-[400px] overflow-auto rounded-md border bg-muted p-2 text-xs">
                  {result.logs.map((l) => `[${l.level}] ${l.message}`).join("\n") || "(no output)"}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Run a script to see its output.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
