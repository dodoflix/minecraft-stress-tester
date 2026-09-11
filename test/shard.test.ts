import { describe, expect, it } from "vitest";
import { mergeSnapshots, splitBudget } from "../src/engine/shard.js";
import type { MetricsSnapshot } from "../src/metrics/collector.js";

describe("splitBudget", () => {
  it("splits evenly, remainder to the front", () => {
    expect(splitBudget(10, 3)).toEqual([4, 3, 3]);
    expect(splitBudget(9, 3)).toEqual([3, 3, 3]);
    expect(splitBudget(7, 2)).toEqual([4, 3]);
  });
  it("caps shards at the bot count (no empty shards)", () => {
    expect(splitBudget(5, 10)).toEqual([1, 1, 1, 1, 1]);
    expect(splitBudget(1, 4)).toEqual([1]);
  });
  it("always sums back to the total", () => {
    for (const [t, s] of [
      [100, 7],
      [2500, 16],
      [3, 3],
    ] as const) {
      expect(splitBudget(t, s).reduce((a, b) => a + b, 0)).toBe(t);
    }
  });
});

const h = (over: Partial<MetricsSnapshot["timeToConnectMs"]> = {}) => ({
  count: 0,
  min: 0,
  max: 0,
  mean: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  ...over,
});
function snap(over: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    elapsedMs: 1000,
    attempted: 0,
    connected: 0,
    loggedIn: 0,
    spawned: 0,
    active: 0,
    ended: 0,
    kicked: 0,
    errors: 0,
    connectSuccessRate: 0,
    packetsIn: 0,
    bytesIn: 0,
    packetsPerSec: 0,
    bytesPerSec: 0,
    tps: 20,
    timeToConnectMs: h(),
    timeToSpawnMs: h(),
    serverPingMs: h(),
    kickReasons: {},
    ...over,
  };
}

describe("mergeSnapshots", () => {
  it("sums counts and recomputes the success rate", () => {
    const m = mergeSnapshots([
      snap({ attempted: 100, spawned: 90, packetsIn: 5, kickReasons: { antibot: 2 } }),
      snap({ attempted: 50, spawned: 40, packetsIn: 3, kickReasons: { antibot: 1, full: 1 } }),
    ]);
    expect(m.attempted).toBe(150);
    expect(m.spawned).toBe(130);
    expect(m.packetsIn).toBe(8);
    expect(m.connectSuccessRate).toBeCloseTo(130 / 150);
    expect(m.kickReasons).toEqual({ antibot: 3, full: 1 });
  });

  it("averages TPS and count-weights percentiles", () => {
    const m = mergeSnapshots([
      snap({ tps: 20, timeToConnectMs: h({ count: 1, p95: 10 }) }),
      snap({ tps: 10, timeToConnectMs: h({ count: 3, p95: 50 }) }),
    ]);
    expect(m.tps).toBe(15);
    expect(m.timeToConnectMs.count).toBe(4);
    expect(m.timeToConnectMs.p95).toBe((10 * 1 + 50 * 3) / 4); // 40
  });

  it("throws on an empty list", () => {
    expect(() => mergeSnapshots([])).toThrow();
  });
});
