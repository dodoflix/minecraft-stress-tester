import type { MetricsSnapshot } from "../metrics/collector.js";

export interface DashboardContext {
  target: string;
  version: string;
  count: number; // target bot count, for the progress bar
}

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n.toFixed(0)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
};

/** Fixed-width ASCII bar, `value/max` filled, `width` cells. */
export function bar(value: number, max: number, width = 24): string {
  const frac = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const filled = Math.round(frac * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

/** Render the full-screen dashboard as a plain string. Pure, so it's unit-tested. */
export function renderDashboard(s: MetricsSnapshot, ctx: DashboardContext): string {
  const pct = (s.connectSuccessRate * 100).toFixed(0);
  const pingP95 = s.serverPingMs.count ? `${s.serverPingMs.p95} ms` : "n/a";
  const lines = [
    `  Minecraft Stress Tester   ${ctx.target}   ${ctx.version}`,
    `  ${"-".repeat(58)}`,
    `  bots     ${bar(s.spawned, ctx.count)} ${s.spawned}/${ctx.count} (${pct}%)   active ${s.active}`,
    `  TPS      ${bar(s.tps, 20)} ${s.tps.toFixed(1)}/20`,
    "",
    `  elapsed        ${(s.elapsedMs / 1000).toFixed(0)} s`,
    `  connect p95    ${s.timeToConnectMs.p95} ms      spawn p95 ${s.timeToSpawnMs.p95} ms`,
    `  server ping    p50 ${s.serverPingMs.count ? `${s.serverPingMs.p50} ms` : "n/a"}   p95 ${pingP95}`,
    `  inbound        ${s.packetsPerSec.toFixed(0)} pkt/s   ${fmtBytes(s.bytesPerSec)}/s`,
    `  kicked/errors  ${s.kicked} / ${s.errors}`,
  ];
  const reasons = Object.entries(s.kickReasons);
  if (reasons.length) {
    lines.push("", "  kick reasons:");
    for (const [reason, n] of reasons) lines.push(`    ${n} x ${reason}`);
  }
  return lines.join("\n");
}
