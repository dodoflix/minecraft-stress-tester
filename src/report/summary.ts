import type { Config } from "../config/schema.js";
import type { MetricsSnapshot } from "../metrics/collector.js";
import { type RunReport, writeCsvReport, writeHtmlReport, writeJsonReport } from "./export.js";

/** Multi-line end-of-run summary. Pure, so it's unit-tested. */
export function formatSummary(s: MetricsSnapshot): string {
  const lines = [
    "",
    "=== Run summary ===",
    `duration:        ${(s.elapsedMs / 1000).toFixed(1)}s`,
    `attempted:       ${s.attempted}`,
    `spawned:         ${s.spawned} (${(s.connectSuccessRate * 100).toFixed(1)}% of attempts)`,
    `peak logged-in:  ${s.loggedIn}`,
    `kicked/errors:   ${s.kicked} / ${s.errors}`,
    `est. server TPS: ${s.tps.toFixed(1)}`,
    `time-to-connect: p50=${s.timeToConnectMs.p50}ms p95=${s.timeToConnectMs.p95}ms p99=${s.timeToConnectMs.p99}ms`,
    `time-to-spawn:   p50=${s.timeToSpawnMs.p50}ms p95=${s.timeToSpawnMs.p95}ms p99=${s.timeToSpawnMs.p99}ms`,
    s.serverPingMs.count
      ? `server ping:     p50=${s.serverPingMs.p50}ms p95=${s.serverPingMs.p95}ms p99=${s.serverPingMs.p99}ms`
      : "server ping:     n/a",
    `inbound total:   ${s.packetsIn} pkts / ${(s.bytesIn / 1024 / 1024).toFixed(2)} MB`,
  ];
  if (Object.keys(s.kickReasons).length) {
    lines.push("kick reasons:");
    for (const [reason, n] of Object.entries(s.kickReasons)) lines.push(`  ${n}x  ${reason}`);
  }
  return lines.join("\n");
}

/** Write the enabled report formats; returns the paths written. */
export function writeReports(report: RunReport, opts: Config["report"]): string[] {
  const paths: string[] = [];
  if (opts.json) paths.push(writeJsonReport(opts.dir, report));
  if (opts.csv) paths.push(writeCsvReport(opts.dir, report));
  if (opts.html) paths.push(writeHtmlReport(opts.dir, report));
  return paths;
}
