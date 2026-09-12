import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServeHandle, ServeOptions, StartServer } from "minecraft-stress-tester";
import { ConfigStore } from "./configStore.js";
import { type ApiContext, type ApiRequest, handleRequest } from "./router.js";
import { RunManager } from "./runManager.js";

export type { ServeHandle, ServeOptions };

// No external CDNs; Monaco's worker is a same-origin file and its styles are injected inline.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function pkgVersion(): string {
  try {
    const raw = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// The built @mcst/ui assets. Resolved via the package so it works installed or in the workspace;
// null when the UI has not been built yet.
function resolveUiDir(): string | null {
  try {
    const pkgPath = fileURLToPath(import.meta.resolve("@mcst/ui/package.json"));
    const dist = join(dirname(pkgPath), "dist");
    return existsSync(join(dist, "index.html")) ? dist : null;
  } catch {
    return null;
  }
}

function serveStatic(res: ServerResponse, uiDir: string | null, pathname: string): void {
  if (!uiDir) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP });
    res.end("<h1>UI not built</h1><p>Run <code>npm run build</code>, then reload this page.</p>");
    return;
  }
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(uiDir, rel));
  if (filePath !== uiDir && !filePath.startsWith(`${uiDir}/`)) {
    res.writeHead(403).end();
    return;
  }
  // Serve the file, or fall back to index.html so the SPA owns unknown routes.
  const target = existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(uiDir, "index.html");
  res.writeHead(200, {
    "content-type": MIME[extname(target)] ?? "application/octet-stream",
    "content-security-policy": CSP,
  });
  res.end(readFileSync(target));
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
export const startServer: StartServer = (opts: ServeOptions = {}): Promise<ServeHandle> => {
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

  const uiDir = resolveUiDir();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (streamMetrics(req, res, url, ctx)) return;
    if (url.pathname.startsWith("/api")) {
      void serve(req, res, url, ctx);
      return;
    }
    if (req.method === "GET") {
      // The API token, injected same-origin so the page never needs an inline script.
      if (url.pathname === "/__mcst.js") {
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "content-security-policy": CSP,
          "cache-control": "no-store",
        });
        res.end(`window.__MCST_TOKEN__=${JSON.stringify(token)};`);
        return;
      }
      serveStatic(res, uiDir, url.pathname);
      return;
    }
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "method not allowed" }));
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
};

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
