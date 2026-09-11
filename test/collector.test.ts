import { describe, it, expect, vi, afterEach } from "vitest";
import { MetricsCollector } from "../src/metrics/collector.js";
import { FakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

describe("MetricsCollector", () => {
  it("counts an attempt per tracked bot", () => {
    const c = new MetricsCollector();
    c.track(new FakeBot());
    c.track(new FakeBot());
    expect(c.snapshot().attempted).toBe(2);
  });

  it("reports a 0 success rate with no attempts", () => {
    expect(new MetricsCollector().snapshot().connectSuccessRate).toBe(0);
  });

  it("aggregates the connection funnel and success rate", () => {
    const c = new MetricsCollector();
    const a = new FakeBot();
    const b = new FakeBot();
    const d = new FakeBot();
    [a, b, d].forEach((bot) => c.track(bot));
    a.reachSpawn(); // connected, login, spawned
    b.reachSpawn();
    d.emit("connected"); // connects but never spawns

    const s = c.snapshot();
    expect(s.attempted).toBe(3);
    expect(s.connected).toBe(3);
    expect(s.loggedIn).toBe(2);
    expect(s.spawned).toBe(2);
    expect(s.connectSuccessRate).toBeCloseTo(2 / 3);
    expect(s.timeToConnectMs.count).toBe(3);
    expect(s.timeToSpawnMs.count).toBe(2);
  });

  it("tracks active connections up on connect and down on end", () => {
    const c = new MetricsCollector();
    const a = new FakeBot();
    const b = new FakeBot();
    c.track(a);
    c.track(b);
    a.emit("connected");
    b.emit("connected");
    expect(c.snapshot().active).toBe(2);
    a.emit("end", "kicked");
    expect(c.snapshot().active).toBe(1);
    expect(c.snapshot().ended).toBe(1);
  });

  it("buckets kick reasons into a histogram", () => {
    const c = new MetricsCollector();
    const bots = [new FakeBot(), new FakeBot(), new FakeBot()];
    bots.forEach((b) => c.track(b));
    bots[0]!.emit("kicked", "antibot");
    bots[1]!.emit("kicked", "antibot");
    bots[2]!.emit("kicked", "server full");
    const s = c.snapshot();
    expect(s.kicked).toBe(3);
    expect(s.kickReasons).toEqual({ antibot: 2, "server full": 1 });
  });

  it("sums inbound packets and bytes", () => {
    const c = new MetricsCollector();
    const b = new FakeBot();
    c.track(b);
    b.emit("packet", "update_time", 12);
    b.emit("packet", "keep_alive", 8);
    const s = c.snapshot();
    expect(s.packetsIn).toBe(2);
    expect(s.bytesIn).toBe(20);
  });

  it("counts errors", () => {
    const c = new MetricsCollector();
    const b = new FakeBot();
    c.track(b);
    b.emit("error", new Error("boom"));
    expect(c.snapshot().errors).toBe(1);
  });

  it("derives TPS from worldAge cadence across time samples", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const c = new MetricsCollector();
    const b = new FakeBot();
    c.track(b);
    b.emit("time", 0n);
    vi.setSystemTime(1000);
    b.emit("time", 10n); // 10 ticks in 1s = 10 TPS
    expect(c.snapshot().tps).toBeGreaterThan(9);
    expect(c.snapshot().tps).toBeLessThan(11);
  });
});
