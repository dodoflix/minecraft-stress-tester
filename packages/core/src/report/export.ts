import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetricsSnapshot } from "../metrics/collector.js";
import type { PreflightResult } from "../net/slp.js";

export interface RunReport {
  finishedAt: string;
  target: { host: string; port: number };
  preflight: PreflightResult | null;
  metrics: MetricsSnapshot;
}

function stamp(report: RunReport): string {
  return report.finishedAt.replace(/[:.]/g, "-");
}

/** Write the final run report as JSON. Returns the path. */
export function writeJsonReport(dir: string, report: RunReport): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `mcst-${stamp(report)}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}

/** Flatten a run report to `key,value` rows (percentiles expanded). Pure; unit-tested. */
export function toCsv(report: RunReport): string {
  const m = report.metrics;
  const rows: [string, string | number][] = [
    ["finishedAt", report.finishedAt],
    ["host", report.target.host],
    ["port", report.target.port],
    ["elapsedMs", m.elapsedMs],
    ["attempted", m.attempted],
    ["connected", m.connected],
    ["loggedIn", m.loggedIn],
    ["spawned", m.spawned],
    ["active", m.active],
    ["ended", m.ended],
    ["kicked", m.kicked],
    ["errors", m.errors],
    ["connectSuccessRate", m.connectSuccessRate],
    ["packetsIn", m.packetsIn],
    ["bytesIn", m.bytesIn],
    ["packetsPerSec", m.packetsPerSec],
    ["bytesPerSec", m.bytesPerSec],
    ["tps", m.tps],
  ];
  for (const [name, h] of [
    ["timeToConnectMs", m.timeToConnectMs],
    ["timeToSpawnMs", m.timeToSpawnMs],
    ["serverPingMs", m.serverPingMs],
  ] as const) {
    for (const stat of ["p50", "p95", "p99", "min", "max", "mean"] as const) {
      rows.push([`${name}.${stat}`, h[stat]]);
    }
  }
  for (const [reason, n] of Object.entries(m.kickReasons)) rows.push([`kick.${reason}`, n]);
  return `metric,value\n${rows.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`).join("\n")}\n`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsvReport(dir: string, report: RunReport): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `mcst-${stamp(report)}.csv`);
  writeFileSync(path, toCsv(report), "utf8");
  return path;
}

/** Self-contained HTML (no external assets) summarizing the run. Pure; unit-tested. */
export function toHtml(report: RunReport): string {
  const m = report.metrics;
  const esc = (v: unknown) =>
    String(v).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
    );
  const pct = (h: MetricsSnapshot["timeToConnectMs"]) => `p50 ${h.p50} / p95 ${h.p95} / p99 ${h.p99} ms`;
  const stat = (label: string, value: string) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
  const kicks = Object.entries(m.kickReasons)
    .map(([r, n]) => `<li>${esc(n)} x ${esc(r)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>mcst report ${esc(report.finishedAt)}</title>
<style>body{font:14px system-ui,sans-serif;margin:2rem;max-width:720px}h1{font-size:1.2rem}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.35rem .6rem;border-bottom:1px solid #ddd}
th{width:40%;color:#555}code{background:#f3f3f3;padding:0 .3rem}</style></head>
<body>
<h1>Minecraft stress test - ${esc(report.target.host)}:${esc(report.target.port)}</h1>
<p>Finished ${esc(report.finishedAt)}${report.preflight ? ` against ${esc(report.preflight.versionName)}` : ""}.</p>
<table>
${stat("Duration", `${(m.elapsedMs / 1000).toFixed(1)} s`)}
${stat("Attempted", String(m.attempted))}
${stat("Spawned", `${m.spawned} (${(m.connectSuccessRate * 100).toFixed(1)}% of attempts)`)}
${stat("Kicked / errors", `${m.kicked} / ${m.errors}`)}
${stat("Est. server TPS", m.tps.toFixed(1))}
${stat("Time to connect", pct(m.timeToConnectMs))}
${stat("Time to spawn", pct(m.timeToSpawnMs))}
${stat("Server-perceived ping", m.serverPingMs.count ? pct(m.serverPingMs) : "n/a")}
${stat("Inbound", `${m.packetsIn} pkts / ${(m.bytesIn / 1024 / 1024).toFixed(2)} MB`)}
</table>
${kicks ? `<h2>Kick reasons</h2><ul>${kicks}</ul>` : ""}
</body></html>
`;
}

export function writeHtmlReport(dir: string, report: RunReport): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `mcst-${stamp(report)}.html`);
  writeFileSync(path, toHtml(report), "utf8");
  return path;
}
