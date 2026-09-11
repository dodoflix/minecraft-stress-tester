import { describe, it, expect } from "vitest";
import { buildSpawnSchedule, runDurationMs, backoffMs } from "../src/engine/ramp.js";
import { Histogram } from "../src/metrics/histogram.js";
import { TpsEstimator } from "../src/metrics/tps.js";
import { longToBigInt } from "../src/util/long.js";
import { makeUsername } from "../src/util/names.js";
import { configSchema } from "../src/config/schema.js";
import { assertAuthorized, AuthorizationError } from "../src/safety/authorization.js";

const baseRamp = { count: 10, connectRate: 5, rampUpSeconds: 0, holdSeconds: 60, rampDownSeconds: 0, jitter: 0.2 };

describe("ramp", () => {
  it("schedules `count` bots, monotonic, at 1/rate spacing", () => {
    const s = buildSpawnSchedule(baseRamp);
    expect(s.length).toBe(10);
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!);
    expect(s[1]! - s[0]!).toBe(200); // 1000/5
  });

  it("ramp-up spaces early spawns wider than steady", () => {
    const s = buildSpawnSchedule({ ...baseRamp, rampUpSeconds: 5 });
    const firstGap = s[1]! - s[0]!;
    const lateGap = s[s.length - 1]! - s[s.length - 2]!;
    expect(firstGap).toBeGreaterThan(lateGap);
  });

  it("runDuration = last spawn + hold + rampDown", () => {
    const s = buildSpawnSchedule(baseRamp);
    expect(runDurationMs(baseRamp, s)).toBe(s[s.length - 1]! + 60000);
  });

  it("backoff stays within [0, cap]", () => {
    for (let r = 0; r < 10; r++) {
      const b = backoffMs(r, 1000, 30000);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(30000);
    }
  });
});

describe("histogram", () => {
  it("computes percentiles on 1..100", () => {
    const h = new Histogram();
    for (let i = 1; i <= 100; i++) h.record(i);
    const s = h.summary();
    expect(s.count).toBe(100);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.p50).toBe(50);
    expect(s.p95).toBe(95);
    expect(s.p99).toBe(99);
  });

  it("empty summary is all-zero, no throw", () => {
    expect(new Histogram().summary().count).toBe(0);
  });
});

describe("tps estimator", () => {
  it("20 ticks over 1s reads ~20 tps", () => {
    const t = new TpsEstimator();
    t.record(0n, 0);
    let v = 20;
    for (let i = 1; i <= 10; i++) v = t.record(BigInt(i * 20), i * 1000);
    expect(v).toBeGreaterThan(19);
    expect(v).toBeLessThanOrEqual(20);
  });

  it("half-speed ticks read ~10 tps", () => {
    const t = new TpsEstimator();
    t.record(0n, 0);
    let v = 20;
    for (let i = 1; i <= 20; i++) v = t.record(BigInt(i * 10), i * 1000);
    expect(v).toBeGreaterThan(9);
    expect(v).toBeLessThan(11);
  });
});

describe("longToBigInt", () => {
  it("handles bigint, number, [high,low], {low,high}", () => {
    expect(longToBigInt(42n)).toBe(42n);
    expect(longToBigInt(42)).toBe(42n);
    expect(longToBigInt([0, 42])).toBe(42n);
    expect(longToBigInt({ high: 0, low: 42 })).toBe(42n);
    expect(longToBigInt([1, 0])).toBe(1n << 32n);
  });
});

describe("usernames", () => {
  it("valid chars, <=16 length", () => {
    for (let i = 0; i < 2000; i += 137) {
      const u = makeUsername("mcst", i);
      expect(u.length).toBeLessThanOrEqual(16);
      expect(u).toMatch(/^[A-Za-z0-9_]+$/);
    }
  });
});

describe("config + legacy migration", () => {
  it("applies defaults", () => {
    const c = configSchema.parse({ target: { host: "localhost" } });
    expect(c.target.port).toBe(25565);
    expect(c.driver).toBe("light");
    expect(c.authorized).toBe(false);
  });
});

describe("authorization gate", () => {
  it("throws unless authorized:true", () => {
    const c = configSchema.parse({ target: { host: "h" } });
    expect(() => assertAuthorized(c)).toThrow(AuthorizationError);
    expect(() => assertAuthorized({ ...c, authorized: true })).not.toThrow();
  });
});
