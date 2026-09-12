import { useCallback, useEffect, useState } from "react";
import { listRuns, type MetricsSnapshot, type RunRecord, startRun, stopRun, streamRun } from "../api.ts";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { Switch } from "../components/ui/switch.tsx";

const SCENARIOS = ["", "join-flood", "sustained-load", "chat-flood", "chunk-thrash"];

function statusVariant(s: RunRecord["status"]): "default" | "secondary" | "destructive" {
  if (s === "running") return "default";
  if (s === "error") return "destructive";
  return "secondary";
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function Dashboard() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(25565);
  const [count, setCount] = useState(10);
  const [driver, setDriver] = useState("light");
  const [scenario, setScenario] = useState("");
  const [authorized, setAuthorized] = useState(false);

  const refresh = useCallback(() => {
    listRuns()
      .then(setRuns)
      .catch((e) => setError(String(e.message)));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    setSnap(null);
    const stop = streamRun(selected, setSnap);
    return stop;
  }, [selected]);

  async function onStart() {
    setError(null);
    try {
      const config: Record<string, unknown> = {
        authorized,
        target: { host, port },
        driver,
        ramp: { count },
      };
      if (scenario) config.scenario = scenario;
      const run = await startRun(config);
      setSelected(run.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onStop(id: string) {
    try {
      await stopRun(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Start a run</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="host">Target host</Label>
            <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="count">Bots</Label>
              <Input
                id="count"
                type="number"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Driver</Label>
            <Select value={driver} onValueChange={setDriver}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">light (scale)</SelectItem>
                <SelectItem value="full">full (realistic)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Scenario</Label>
            <Select value={scenario || "none"} onValueChange={(v) => setScenario(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s || "none"} value={s || "none"}>
                    {s || "none"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch id="authorized" checked={authorized} onCheckedChange={setAuthorized} />
            <Label htmlFor="authorized">I am authorized to test this target</Label>
          </div>
          <Button onClick={onStart} disabled={!authorized || !host}>
            Start run
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Runs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
            {runs.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between rounded-md border p-2 text-sm ${
                  selected === r.id ? "ring-2 ring-ring" : ""
                }`}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 text-left"
                  onClick={() => setSelected(r.id)}
                >
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  <span className="font-mono">
                    {r.target.host}:{r.target.port}
                  </span>
                </button>
                {r.status === "running" && (
                  <Button variant="destructive" size="sm" onClick={() => onStop(r.id)}>
                    Stop
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader>
              <CardTitle>Live metrics</CardTitle>
            </CardHeader>
            <CardContent>
              {snap ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile label="Attempted" value={snap.attempted} />
                  <Tile label="Connected" value={snap.connected} />
                  <Tile label="Spawned" value={snap.spawned} />
                  <Tile label="Active" value={snap.active} />
                  <Tile label="Est. TPS" value={snap.tps.toFixed(1)} />
                  <Tile label="Packets/s" value={Math.round(snap.packetsPerSec)} />
                  <Tile label="KiB/s in" value={(snap.bytesPerSec / 1024).toFixed(1)} />
                  <Tile label="Kicked" value={snap.kicked} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for metrics...</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
