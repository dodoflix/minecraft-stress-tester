import type { MetricsSnapshot } from "../metrics/collector.js";

type Summary = MetricsSnapshot["timeToConnectMs"];

/**
 * Split `total` bots across `shards` worker processes as evenly as possible.
 * Never returns empty shards: caps the shard count at `total`.
 */
export function splitBudget(total: number, shards: number): number[] {
  const n = Math.max(1, Math.min(shards, total));
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** count-weighted mean of a percentile field across histogram summaries. */
function weighted(summaries: Summary[], field: keyof Summary): number {
  const totalCount = summaries.reduce((a, s) => a + s.count, 0);
  if (totalCount === 0) return 0;
  return summaries.reduce((a, s) => a + s[field] * s.count, 0) / totalCount;
}

function mergeSummary(summaries: Summary[]): Summary {
  const present = summaries.filter((s) => s.count > 0);
  if (present.length === 0) return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  return {
    count: present.reduce((a, s) => a + s.count, 0),
    min: Math.min(...present.map((s) => s.min)),
    max: Math.max(...present.map((s) => s.max)),
    mean: weighted(present, "mean"),
    // Percentiles can't be merged exactly from summaries; count-weight them as an estimate.
    p50: weighted(present, "p50"),
    p95: weighted(present, "p95"),
    p99: weighted(present, "p99"),
  };
}

/**
 * Aggregate per-shard snapshots into one. Scalar counts sum; rates sum; TPS averages
 * (same server); percentile histograms are count-weighted estimates (see mergeSummary).
 */
export function mergeSnapshots(snaps: MetricsSnapshot[]): MetricsSnapshot {
  if (snaps.length === 0) throw new Error("mergeSnapshots: no snapshots");
  const sum = (f: (s: MetricsSnapshot) => number) => snaps.reduce((a, s) => a + f(s), 0);
  const attempted = sum((s) => s.attempted);
  const spawned = sum((s) => s.spawned);
  const kickReasons: Record<string, number> = {};
  for (const s of snaps) {
    for (const [reason, n] of Object.entries(s.kickReasons)) {
      kickReasons[reason] = (kickReasons[reason] ?? 0) + n;
    }
  }
  return {
    elapsedMs: Math.max(...snaps.map((s) => s.elapsedMs)),
    attempted,
    connected: sum((s) => s.connected),
    loggedIn: sum((s) => s.loggedIn),
    spawned,
    active: sum((s) => s.active),
    ended: sum((s) => s.ended),
    kicked: sum((s) => s.kicked),
    errors: sum((s) => s.errors),
    connectSuccessRate: attempted ? spawned / attempted : 0,
    packetsIn: sum((s) => s.packetsIn),
    bytesIn: sum((s) => s.bytesIn),
    packetsPerSec: sum((s) => s.packetsPerSec),
    bytesPerSec: sum((s) => s.bytesPerSec),
    tps: snaps.reduce((a, s) => a + s.tps, 0) / snaps.length,
    timeToConnectMs: mergeSummary(snaps.map((s) => s.timeToConnectMs)),
    timeToSpawnMs: mergeSummary(snaps.map((s) => s.timeToSpawnMs)),
    serverPingMs: mergeSummary(snaps.map((s) => s.serverPingMs)),
    kickReasons,
  };
}
