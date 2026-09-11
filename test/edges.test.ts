import { describe, it, expect } from "vitest";
import { jittered, buildSpawnSchedule } from "../src/engine/ramp.js";
import { longToBigInt } from "../src/util/long.js";
import { parsePing } from "../src/net/slp.js";
import { Histogram } from "../src/metrics/histogram.js";
import { buildBehaviors } from "../src/behaviors/index.js";
import { configSchema } from "../src/config/schema.js";

describe("jittered", () => {
  it("returns the exact delay when jitter is 0", () => {
    expect(jittered(1000, 0)).toBe(1000);
  });

  it("stays within ±jitter of the delay", () => {
    for (let i = 0; i < 500; i++) {
      const v = jittered(1000, 0.2);
      expect(v).toBeGreaterThanOrEqual(800);
      expect(v).toBeLessThanOrEqual(1200);
    }
  });

  it("never goes negative", () => {
    for (let i = 0; i < 100; i++) expect(jittered(0, 0.9)).toBeGreaterThanOrEqual(0);
  });
});

describe("buildSpawnSchedule edge", () => {
  it("returns an empty schedule for count 0", () => {
    const cfg = configSchema.parse({ target: { host: "h" }, ramp: { count: 1 } });
    // count is min 1 in schema, so exercise the pure function directly with 0
    expect(buildSpawnSchedule({ ...cfg.ramp, count: 0 })).toEqual([]);
  });
});

describe("longToBigInt fallthrough", () => {
  it("returns 0n for unhandled shapes", () => {
    expect(longToBigInt("nope")).toBe(0n);
    expect(longToBigInt(undefined)).toBe(0n);
    expect(longToBigInt(true)).toBe(0n);
    expect(longToBigInt([1, 2, 3])).toBe(0n); // wrong-length array
  });
});

describe("parsePing edge", () => {
  it("empty motd for null/absent description", () => {
    expect(parsePing({ description: null }).motd).toBe("");
    expect(parsePing({}).motd).toBe("");
  });
});

describe("Histogram single value", () => {
  it("all percentiles equal the lone sample", () => {
    const h = new Histogram();
    h.record(42);
    const s = h.summary();
    expect(s).toMatchObject({ count: 1, min: 42, max: 42, mean: 42, p50: 42, p95: 42, p99: 42 });
  });
});

describe("buildBehaviors with chatSpam", () => {
  it("includes chatSpam when enabled", () => {
    const cfg = configSchema.parse({
      target: { host: "h" },
      behaviors: { chatSpam: { enabled: true, message: "x" } },
    });
    expect(buildBehaviors(cfg)).toHaveLength(1);
  });

  it("includes both auth and chatSpam when both enabled", () => {
    const cfg = configSchema.parse({
      target: { host: "h" },
      behaviors: { auth: { enabled: true, password: "p" }, chatSpam: { enabled: true } },
    });
    expect(buildBehaviors(cfg)).toHaveLength(2);
  });
});
