import { useCallback, useEffect, useRef, useState } from "react";
import { wsUrl } from "../api.ts";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Switch } from "../components/ui/switch.tsx";

type Line = { kind: string; text: string };

export function Console() {
  const [connected, setConnected] = useState(false);
  const [attached, setAttached] = useState(false);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(25565);
  const [authorized, setAuthorized] = useState(false);
  const [line, setLine] = useState("");
  const [log, setLog] = useState<Line[]>([]);
  const ws = useRef<WebSocket | null>(null);

  const push = useCallback(
    (kind: string, text: string) => setLog((l) => [...l.slice(-300), { kind, text }]),
    [],
  );

  useEffect(() => {
    const socket = new WebSocket(wsUrl());
    ws.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => {
      setConnected(false);
      setAttached(false);
    };
    socket.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "hello") push("sys", `connected (protocol ${m.protocol}, v${m.version})`);
        else if (m.type === "ack") push("sys", m.ok ? "ok" : `error: ${m.error}`);
        else if (m.type === "result") push("out", m.text);
        else if (m.type === "event") push("event", `[${m.event}] ${JSON.stringify(m.data ?? {})}`);
        else if (m.type === "log") push("log", `[${m.level}] ${m.args.join(" ")}`);
        else if (m.type === "script.done")
          push("sys", m.error ? `script error: ${m.error}` : "script finished");
        else if (m.type === "error") push("err", m.error);
      } catch {
        // ignore malformed frame
      }
    };
    return () => socket.close();
  }, [push]);

  const sendJson = (obj: unknown) =>
    ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify(obj));

  function attach() {
    sendJson({ type: "attach", target: { host, port }, authorized });
    setAttached(true);
  }
  function submit() {
    if (!line.trim()) return;
    push("in", `> ${line}`);
    sendJson({ type: "debug", line });
    setLine("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Attach a bot</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Badge variant={connected ? "secondary" : "destructive"} className="self-start">
            {connected ? "connected" : "disconnected"}
          </Badge>
          <div className="grid gap-1.5">
            <Label htmlFor="c-host">Host</Label>
            <Input id="c-host" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-port">Port</Label>
            <Input id="c-port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch id="c-auth" checked={authorized} onCheckedChange={setAuthorized} />
            <Label htmlFor="c-auth">I am authorized to test this target</Label>
          </div>
          <Button onClick={attach} disabled={!connected || !authorized || !host}>
            Attach
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remote debug console</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <pre className="h-[440px] w-full overflow-auto rounded-md border bg-muted p-2 text-xs">
            {log.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log lines
              <div key={i} className={l.kind === "err" ? "text-destructive" : undefined}>
                {l.text}
              </div>
            ))}
          </pre>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              placeholder={attached ? "type a debug command (help)" : "attach a bot first"}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              disabled={!attached}
            />
            <Button type="submit" disabled={!attached}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
