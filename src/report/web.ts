import { createServer } from "node:http";
import type { MetricsCollector } from "../metrics/collector.js";
import type { DashboardContext } from "./dashboard.js";
import { renderWebPage } from "./webPage.js";

/**
 * Local web dashboard: serves a self-contained page and pushes metric snapshots over
 * Server-Sent Events (built-in http, no dependency). HTTP/socket I/O, excluded from
 * coverage; the page markup (webPage.ts) is unit-tested.
 */
export function startWebReporter(
  collector: MetricsCollector,
  port: number,
  ctx: DashboardContext,
  intervalMs = 1000,
): () => void {
  const page = renderWebPage(ctx);
  const clients = new Set<import("node:http").ServerResponse>();

  const server = createServer((req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(collector.snapshot())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
  });
  server.listen(port, () => process.stdout.write(`Web dashboard: http://localhost:${port}\n`));

  const timer = setInterval(() => {
    const data = `data: ${JSON.stringify(collector.snapshot())}\n\n`;
    for (const res of clients) res.write(data);
  }, intervalMs);

  return () => {
    clearInterval(timer);
    for (const res of clients) res.end();
    server.close();
  };
}
