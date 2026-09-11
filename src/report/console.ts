import type { MetricsCollector, MetricsSnapshot } from "../metrics/collector.js";

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n.toFixed(0)}B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 ** 2).toFixed(1)}MB`;
};

export function formatLine(s: MetricsSnapshot): string {
  const pct = (s.connectSuccessRate * 100).toFixed(0);
  return [
    `t=${(s.elapsedMs / 1000).toFixed(0)}s`,
    `active=${s.active}`,
    `spawned=${s.spawned}/${s.attempted}(${pct}%)`,
    `tps~${s.tps.toFixed(1)}`,
    `connect_p95=${s.timeToConnectMs.p95}ms`,
    `in=${s.packetsPerSec.toFixed(0)}pkt/s ${fmtBytes(s.bytesPerSec)}/s`,
    `kick=${s.kicked} err=${s.errors}`,
  ].join("  ");
}

/** Periodic one-line console summary. Returns a stop fn. */
export function startConsoleReporter(collector: MetricsCollector, intervalMs = 1000): () => void {
  const timer = setInterval(() => {
    process.stdout.write(formatLine(collector.snapshot()) + "\n");
  }, intervalMs);
  return () => clearInterval(timer);
}
