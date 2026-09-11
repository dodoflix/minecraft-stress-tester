import { describe, expect, it } from "vitest";
import { configSchema } from "../src/config/schema.js";
import type { MetricsSnapshot } from "../src/metrics/collector.js";
import { type RunEngine, RunManager } from "../src/server/runManager.js";

const config = configSchema.parse({ authorized: true, target: { host: "localhost" }, ramp: { count: 5 } });

function snap(tps: number): MetricsSnapshot {
  return {
    elapsedMs: 0,
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
    tps,
    timeToConnectMs: { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 },
    timeToSpawnMs: { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 },
    serverPingMs: { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 },
    kickReasons: {},
  };
}

/** Fake engine whose run promise resolves/rejects only when the test says so. */
class FakeEngine implements RunEngine {
  stopped = false;
  private resolve!: (s: MetricsSnapshot) => void;
  private reject!: (e: unknown) => void;
  private readonly promise = new Promise<MetricsSnapshot>((res, rej) => {
    this.resolve = res;
    this.reject = rej;
  });
  constructor(
    private readonly live = snap(15),
    private readonly final = snap(20),
  ) {}
  run(): Promise<MetricsSnapshot> {
    return this.promise;
  }
  stop(): void {
    this.stopped = true;
    this.resolve(this.final); // real Engine.stop() also resolves the run
  }
  liveSnapshot(): MetricsSnapshot {
    return this.live;
  }
  finish(): void {
    this.resolve(this.final);
  }
  fail(e: unknown): void {
    this.reject(e);
  }
}

const tick = () => new Promise((r) => setImmediate(r));

describe("RunManager", () => {
  it("starts a run, lists and gets it, reports live metrics while running", () => {
    const engine = new FakeEngine();
    const rm = new RunManager(() => engine);
    const rec = rm.start(config);

    expect(rec.status).toBe("running");
    expect(rec.count).toBe(5);
    expect(rec.target).toEqual({ host: "localhost", port: 25565 });
    expect(rm.list()).toHaveLength(1);
    expect(rm.get(rec.id)).toBe(rec);
    expect(rm.snapshot(rec.id)?.tps).toBe(15); // live
  });

  it("marks completed and serves the final snapshot when the engine resolves", async () => {
    const engine = new FakeEngine();
    const rm = new RunManager(() => engine);
    const rec = rm.start(config);
    engine.finish();
    await tick();
    expect(rec.status).toBe("completed");
    expect(rec.finishedAt).toBeDefined();
    expect(rm.snapshot(rec.id)?.tps).toBe(20); // final
  });

  it("marks failed with the error message when the engine rejects", async () => {
    const engine = new FakeEngine();
    const rm = new RunManager(() => engine);
    const rec = rm.start(config);
    engine.fail(new Error("boom"));
    await tick();
    expect(rec.status).toBe("failed");
    expect(rec.error).toBe("boom");
  });

  it("stringifies a non-Error rejection", async () => {
    const engine = new FakeEngine();
    const rm = new RunManager(() => engine);
    const rec = rm.start(config);
    engine.fail("weird");
    await tick();
    expect(rec.error).toBe("weird");
  });

  it("stops a running run and keeps it 'stopped' even after resolution", async () => {
    const engine = new FakeEngine();
    const rm = new RunManager(() => engine);
    const rec = rm.start(config);
    expect(rm.stop(rec.id)).toBe(true);
    expect(engine.stopped).toBe(true);
    expect(rec.status).toBe("stopped");
    await tick();
    expect(rec.status).toBe("stopped"); // not overwritten to completed
    expect(rm.snapshot(rec.id)?.tps).toBe(20);
  });

  it("refuses to stop an unknown or already-finished run", async () => {
    const engine = new FakeEngine();
    const rm = new RunManager(() => engine);
    const rec = rm.start(config);
    expect(rm.stop("nope")).toBe(false);
    engine.finish();
    await tick();
    expect(rm.stop(rec.id)).toBe(false);
  });

  it("returns undefined for unknown ids", () => {
    const rm = new RunManager(() => new FakeEngine());
    expect(rm.get("nope")).toBeUndefined();
    expect(rm.snapshot("nope")).toBeUndefined();
  });
});
