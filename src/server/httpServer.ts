import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { renderUiPage } from "../ui/page.js";
import { ConfigStore } from "./configStore.js";
import { type ApiContext, type ApiRequest, handleRequest } from "./router.js";
import { RunManager } from "./runManager.js";

export interface ServeOptions {
  port?: number;
  /** Bind address. Defaults to localhost so the API never listens on a public interface. */
  host?: string;
  /** Fixed API token; a random one is generated (and returned) when omitted. */
  token?: string;
  reportsDir?: string;
  configsDir?: string;
}

export interface ServeHandle {
  url: string;
  token: string;
  close: () => Promise<void>;
}

function pkgVersion(): string {
  try {
    const raw = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function tokenOf(req: IncomingMessage, query: URLSearchParams): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return query.get("token") ?? undefined;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The control-plane daemon: binds localhost, requires a bearer token, routes REST via the
 * pure router, and streams live run metrics over SSE. Socket/streaming I/O, excluded from
 * coverage; the routing logic lives in router.ts and is unit-tested.
 */
export function startServer(opts: ServeOptions = {}): Promise<ServeHandle> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 8080;
  const token = opts.token ?? randomBytes(24).toString("hex");
  const ctx: ApiContext = {
    runs: new RunManager(),
    configs: new ConfigStore(opts.configsDir ?? "./configs"),
    reportsDir: opts.reportsDir ?? "./reports",
    token,
    version: pkgVersion(),
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderUiPage(token));
      return;
    }
    if (streamMetrics(req, res, url, ctx)) return;
    void serve(req, res, url, ctx);
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({
        url: `http://${host}:${port}`,
        token,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

async function serve(req: IncomingMessage, res: ServerResponse, url: URL, ctx: ApiContext): Promise<void> {
  const query = url.searchParams;
  const apiReq: ApiRequest = {
    method: req.method ?? "GET",
    path: url.pathname,
    query,
    token: tokenOf(req, query),
    body: req.method === "POST" || req.method === "PUT" ? await readBody(req) : undefined,
  };
  const { status, body } = handleRequest(apiReq, ctx);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// GET /api/runs/:id/stream -> SSE of live metrics. Returns true if it handled the request.
function streamMetrics(req: IncomingMessage, res: ServerResponse, url: URL, ctx: ApiContext): boolean {
  const m = url.pathname.match(/^\/api\/runs\/([^/]+)\/stream$/);
  if (!m || req.method !== "GET") return false;

  const query = url.searchParams;
  if (tokenOf(req, query) !== ctx.token) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "missing or invalid API token" }));
    return true;
  }
  const id = m[1] as string;
  if (!ctx.runs.get(id)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "run not found" }));
    return true;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const push = () => {
    const snap = ctx.runs.snapshot(id);
    if (snap) res.write(`data: ${JSON.stringify(snap)}\n\n`);
    if (ctx.runs.get(id)?.status !== "running") {
      clearInterval(timer);
      res.end();
    }
  };
  const timer = setInterval(push, 1000);
  push();
  req.on("close", () => clearInterval(timer));
  return true;
}
