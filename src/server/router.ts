import { timingSafeEqual } from "node:crypto";
import { configSchema } from "../config/schema.js";
import type { ConfigStore } from "./configStore.js";
import { validateConfig } from "./configStore.js";
import { listHistory, readHistory } from "./history.js";
import type { RunManager } from "./runManager.js";

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body?: unknown;
  token?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiContext {
  runs: RunManager;
  configs: ConfigStore;
  reportsDir: string;
  token: string;
  version: string;
}

function json(status: number, body: unknown): ApiResponse {
  return { status, body };
}

function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Pure request router for the control-plane API: no sockets, no streaming. The HTTP layer
 * parses a request into ApiRequest, calls this, and writes the ApiResponse. The SSE metrics
 * stream is handled in the HTTP layer directly (it can't be a single response body).
 */
export function handleRequest(req: ApiRequest, ctx: ApiContext): ApiResponse {
  const segments = req.path.split("/").filter(Boolean); // "/api/runs" -> ["api","runs"]
  if (segments[0] !== "api") return json(404, { error: "not found" });

  // Unauthenticated health/version probe.
  if (segments.length === 1 && req.method === "GET") {
    return json(200, { name: "minecraft-stress-tester", version: ctx.version, api: 1 });
  }

  if (!req.token || !tokensMatch(req.token, ctx.token)) {
    return json(401, { error: "missing or invalid API token" });
  }

  const [, resource, id, sub] = segments;

  if (resource === "runs") return runs(req, ctx, id, sub);
  if (resource === "configs") return configs(req, ctx, id);
  if (resource === "history") return history(req, ctx, id);
  return json(404, { error: "not found" });
}

function runs(req: ApiRequest, ctx: ApiContext, id?: string, sub?: string): ApiResponse {
  if (!id) {
    if (req.method === "GET") return json(200, { runs: ctx.runs.list() });
    if (req.method === "POST") {
      const parsed = configSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return json(400, { error: "invalid config", issues: parsed.error.issues });
      }
      if (parsed.data.authorized !== true) {
        return json(400, { error: "authorization not confirmed: set authorized: true" });
      }
      return json(201, ctx.runs.start(parsed.data));
    }
    return json(405, { error: "method not allowed" });
  }

  if (sub === "metrics" && req.method === "GET") {
    const snap = ctx.runs.snapshot(id);
    return snap ? json(200, snap) : json(404, { error: "run not found" });
  }
  if (sub === "stop" && req.method === "POST") {
    return ctx.runs.stop(id)
      ? json(200, { stopped: id })
      : json(404, { error: "run not found or already finished" });
  }
  if (!sub && req.method === "GET") {
    const record = ctx.runs.get(id);
    return record ? json(200, record) : json(404, { error: "run not found" });
  }
  return json(404, { error: "not found" });
}

function configs(req: ApiRequest, ctx: ApiContext, name?: string): ApiResponse {
  if (name === "validate" && req.method === "POST") {
    const body = (req.body ?? {}) as { content?: string; ext?: string };
    return json(200, validateConfig(body.content ?? "", body.ext ?? ".yaml"));
  }
  if (!name) {
    if (req.method === "GET") return json(200, { configs: ctx.configs.list() });
    return json(405, { error: "method not allowed" });
  }
  if (req.method === "GET") {
    const content = ctx.configs.read(name);
    return content !== undefined ? json(200, { name, content }) : json(404, { error: "config not found" });
  }
  if (req.method === "PUT") {
    const body = (req.body ?? {}) as { content?: string };
    const result = ctx.configs.write(name, body.content ?? "");
    return result.valid ? json(200, { name, ...result }) : json(400, result);
  }
  if (req.method === "DELETE") {
    return ctx.configs.delete(name) ? json(200, { deleted: name }) : json(404, { error: "config not found" });
  }
  return json(405, { error: "method not allowed" });
}

function history(req: ApiRequest, ctx: ApiContext, file?: string): ApiResponse {
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  if (!file) return json(200, { history: listHistory(ctx.reportsDir) });
  const report = readHistory(ctx.reportsDir, file);
  return report ? json(200, report) : json(404, { error: "report not found" });
}
