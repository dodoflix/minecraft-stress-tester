import { timingSafeEqual } from "node:crypto";
import {
  blueprintToGraph,
  buildRunConfig,
  compileToCode,
  configFormFields,
  configJsonSchema,
  graphToBlueprint,
  parseBlueprint,
  type ScriptGraph,
  toHtml,
} from "minecraft-stress-tester";
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
  if (resource === "history") return history(req, ctx, id, sub);
  if (resource === "graph") return graph(req, id);
  // Schema descriptor for the UI's generated config form; derived from the one zod schema.
  if (resource === "schema" && req.method === "GET") {
    return json(200, { jsonSchema: configJsonSchema(), fields: configFormFields() });
  }
  return json(404, { error: "not found" });
}

function runs(req: ApiRequest, ctx: ApiContext, id?: string, sub?: string): ApiResponse {
  if (!id) {
    if (req.method === "GET") return json(200, { runs: ctx.runs.list() });
    if (req.method === "POST") {
      const parsed = buildRunConfig(req.body ?? {});
      if (!parsed.success || !parsed.config) {
        return json(400, { error: "invalid config", issues: parsed.issues });
      }
      if (parsed.config.authorized !== true) {
        return json(400, { error: "authorization not confirmed: set authorized: true" });
      }
      return json(201, ctx.runs.start(parsed.config));
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

// The visual node editor: compile a graph to a blueprint + ejected code, or turn a blueprint into a
// graph. Pure (a code generator over the one blueprint model), so it lives in the pure router.
function graph(req: ApiRequest, action?: string): ApiResponse {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const body = (req.body ?? {}) as { graph?: ScriptGraph; blueprint?: unknown };
  if (action === "compile") {
    const result = graphToBlueprint(body.graph ?? { nodes: [], edges: [] });
    if (!result.ok || !result.blueprint) return json(400, { ok: false, errors: result.errors });
    return json(200, { ok: true, blueprint: result.blueprint, code: compileToCode(result.blueprint) });
  }
  if (action === "import") {
    const parsed = parseBlueprint(body.blueprint ?? {});
    if (!parsed.ok || !parsed.blueprint) return json(400, { ok: false, errors: parsed.errors });
    return json(200, { ok: true, graph: blueprintToGraph(parsed.blueprint) });
  }
  return json(404, { error: "not found" });
}

function history(req: ApiRequest, ctx: ApiContext, file?: string, sub?: string): ApiResponse {
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  if (!file) return json(200, { history: listHistory(ctx.reportsDir) });
  const report = readHistory(ctx.reportsDir, file);
  if (!report) return json(404, { error: "report not found" });
  // The one HTML report renderer, reused for the UI's history view (shown in a sandboxed frame).
  if (sub === "html") return json(200, { html: toHtml(report) });
  return json(200, report);
}
