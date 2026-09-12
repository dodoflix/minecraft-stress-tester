// Thin typed client for the control-plane API. The token is injected same-origin by the server
// (/__mcst.js -> window.__MCST_TOKEN__); the SSE stream takes it as a query param since
// EventSource cannot set an Authorization header.

declare global {
  interface Window {
    __MCST_TOKEN__?: string;
  }
}

export const token = window.__MCST_TOKEN__ ?? new URLSearchParams(location.search).get("token") ?? "";

export interface Histogram {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsSnapshot {
  elapsedMs: number;
  attempted: number;
  connected: number;
  loggedIn: number;
  spawned: number;
  active: number;
  ended: number;
  kicked: number;
  errors: number;
  connectSuccessRate: number;
  packetsIn: number;
  bytesIn: number;
  packetsPerSec: number;
  bytesPerSec: number;
  tps: number;
  timeToConnectMs: Histogram;
  timeToSpawnMs: Histogram;
  serverPingMs: Histogram;
  kickReasons: Record<string, number>;
}

export interface RunRecord {
  id: string;
  status: "running" | "finished" | "stopped" | "error";
  startedAt: string;
  finishedAt?: string;
  target: { host: string; port: number };
  error?: string;
}

export interface FormField {
  path: string;
  label: string;
  group: string;
  kind: "string" | "number" | "integer" | "boolean" | "enum" | "string[]";
  required: boolean;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export interface ValidationResult {
  valid: boolean;
  config?: Record<string, unknown>;
  errors?: string[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; issues?: unknown };
      if (body.error) msg = body.error;
    } catch {
      // non-JSON error body; keep the status line
    }
    throw new Error(msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const listRuns = () => api<{ runs: RunRecord[] }>("/runs").then((r) => r.runs);
export const startRun = (config: unknown) =>
  api<RunRecord>("/runs", { method: "POST", body: JSON.stringify(config) });
export const stopRun = (id: string) => api<unknown>(`/runs/${id}/stop`, { method: "POST" });
export const getRun = (id: string) => api<RunRecord>(`/runs/${id}`);

export const getSchema = () => api<{ fields: FormField[] }>("/schema");

export const listConfigs = () => api<{ configs: string[] }>("/configs").then((r) => r.configs);
export const getConfig = (name: string) => api<{ name: string; content: string }>(`/configs/${name}`);
export const saveConfig = (name: string, content: string) =>
  api<ValidationResult>(`/configs/${name}`, { method: "PUT", body: JSON.stringify({ content }) });
export const deleteConfig = (name: string) => api<unknown>(`/configs/${name}`, { method: "DELETE" });
export const validateConfig = (content: string, ext: string) =>
  api<ValidationResult>("/configs/validate", { method: "POST", body: JSON.stringify({ content, ext }) });

export interface HistoryEntry {
  file: string;
  finishedAt: string;
  target: { host: string; port: number };
  spawned?: number;
  tps?: number;
}
export const listHistory = () => api<{ history: HistoryEntry[] }>("/history").then((r) => r.history);
export const getHistoryHtml = (file: string) =>
  api<{ html: string }>(`/history/${file}/html`).then((r) => r.html);

export function streamRun(id: string, onSnap: (s: MetricsSnapshot) => void): () => void {
  const es = new EventSource(`/api/runs/${id}/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    try {
      onSnap(JSON.parse(e.data) as MetricsSnapshot);
    } catch {
      // ignore malformed frame
    }
  };
  return () => es.close();
}

export const validateScript = (code: string) =>
  api<{ ok: boolean; error?: string }>("/script/validate", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export interface ScriptRunResult {
  ok: boolean;
  logs: Array<{ level: string; message: string }>;
  error?: string;
}
export const runScript = (payload: {
  code: string;
  target: { host: string; port: number };
  authorized: boolean;
  timeoutMs?: number;
}) => api<ScriptRunResult>("/script/run", { method: "POST", body: JSON.stringify(payload) });

export interface CompileGraphResult {
  ok: boolean;
  blueprint?: unknown;
  code?: string;
  errors?: string[];
}
export const compileGraph = (graph: unknown) =>
  api<CompileGraphResult>("/graph/compile", { method: "POST", body: JSON.stringify({ graph }) });
export const importBlueprintToGraph = (blueprint: unknown) =>
  api<{ ok: boolean; graph?: unknown; errors?: string[] }>("/graph/import", {
    method: "POST",
    body: JSON.stringify({ blueprint }),
  });
