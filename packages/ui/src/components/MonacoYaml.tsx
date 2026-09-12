import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useEffect, useRef } from "react";

// Bundled same-origin worker (no CDN), so a strict CSP is satisfied.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function MonacoYaml({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const settingValue = useRef(false);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: editor created once; value syncs below
  useEffect(() => {
    if (!host.current) return;
    const ed = monaco.editor.create(host.current, {
      value,
      language: "yaml",
      theme: isDark() ? "vs-dark" : "vs",
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 13,
      scrollBeyondLastLine: false,
      tabSize: 2,
    });
    editor.current = ed;
    const sub = ed.onDidChangeModelContent(() => {
      if (!settingValue.current) onChangeRef.current(ed.getValue());
    });
    const observer = new MutationObserver(() => monaco.editor.setTheme(isDark() ? "vs-dark" : "vs"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      sub.dispose();
      observer.disconnect();
      ed.dispose();
    };
  }, []);

  useEffect(() => {
    const ed = editor.current;
    if (ed && ed.getValue() !== value) {
      settingValue.current = true;
      ed.setValue(value);
      settingValue.current = false;
    }
  }, [value]);

  return <div ref={host} className="h-[520px] w-full overflow-hidden rounded-md border" />;
}
