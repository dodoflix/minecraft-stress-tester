import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLine } from "../src/report/console.js";
import type { MetricsSnapshot } from "../src/metrics/collector.js";
import { MetricsCollector } from "../src/metrics/collector.js";
import { parsePing } from "../src/net/slp.js";
import { chatSpam } from "../src/behaviors/chatSpam.js";
import { Histogram } from "../src/metrics/histogram.js";
import { loadConfig } from "../src/config/load.js";
import { buildSpawnSchedule, runDurationMs } from "../src/engine/ramp.js";
import { Registry } from "../src/engine/registry.js";
import { configSchema } from "../src/config/schema.js";
import { FakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

const emptySummary = { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
function snap(over: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    elapsedMs: 1000, attempted: 1, connected: 1, loggedIn: 1, spawned: 1, active: 1,
    ended: 0, kicked: 0, errors: 0, connectSuccessRate: 1, packetsIn: 0, bytesIn: 0,
    packetsPerSec: 0, bytesPerSec: 0, tps: 20, timeToConnectMs: emptySummary,
    timeToSpawnMs: emptySummary, kickReasons: {}, ...over,
  };
}

describe("formatLine byte-rate units", () => {
  it("renders bytes, KB, and MB per second", () => {
    expect(formatLine(snap({ bytesPerSec: 500 }))).toContain("500B/s");
    expect(formatLine(snap({ bytesPerSec: 5000 }))).toContain("4.9KB/s");
    expect(formatLine(snap({ bytesPerSec: 5_000_000 }))).toContain("MB/s");
  });
});

describe("parsePing branch coverage", () => {
  it("flattens extra entries that are raw strings", () => {
    expect(parsePing({ description: { extra: [{ text: "a" }, "b"] } }).motd).toBe("ab");
  });
  it("empty motd when description has neither text nor extra", () => {
    expect(parsePing({ description: {} }).motd).toBe("");
  });
});

describe("chatSpam start guard", () => {
  it("a second spawn does not double the interval", () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    chatSpam({ enabled: true, message: "x", delayMs: 1000 })(bot);
    bot.emit("spawned");
    bot.emit("spawned"); // guard: already running
    vi.advanceTimersByTime(3000);
    expect(bot.chats).toHaveLength(3); // one interval, not two
  });
});

describe("collector active-count guards", () => {
  it("a second connected does not double active; end before connect does not underflow", () => {
    const c = new MetricsCollector();
    const a = new FakeBot();
    c.track(a);
    a.emit("connected");
    a.emit("connected"); // guard
    expect(c.snapshot().active).toBe(1);

    const b = new FakeBot();
    c.track(b);
    b.emit("end", "gone"); // ended without a prior connect
    expect(c.snapshot().active).toBe(1); // unchanged, no underflow
  });
});

describe("Histogram two samples", () => {
  it("upper percentiles pick the top sample", () => {
    const h = new Histogram();
    h.record(10);
    h.record(20);
    const s = h.summary();
    expect(s.p50).toBe(10);
    expect(s.p95).toBe(20);
    expect(s.p99).toBe(20);
  });
});

describe("loadConfig branch coverage", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  const write = (name: string, body: string) => {
    dir = mkdtempSync(join(tmpdir(), "mcst-br-"));
    const p = join(dir, name);
    writeFileSync(p, body);
    return p;
  };

  it("reads a .yml extension", () => {
    const c = loadConfig(write("run.yml", "authorized: true\ntarget:\n  host: ymlhost\n"));
    expect(c.target.host).toBe("ymlhost");
  });

  it("does not migrate when target is already present", () => {
    const c = loadConfig(write("mixed.json", JSON.stringify({ host: "ignore", target: { host: "real" } })));
    expect(c.target.host).toBe("real");
  });

  it("legacy without a port keeps the default port", () => {
    const c = loadConfig(write("config.json", JSON.stringify({ host: "legacy", count: 2 })));
    expect(c.target.host).toBe("legacy");
    expect(c.target.port).toBe(25565);
    expect(c.ramp.count).toBe(2);
  });

  it("applies driver and explicit authorized:false via CLI", () => {
    const c = loadConfig(write("run.json", JSON.stringify({ target: { host: "h" }, authorized: true })), {
      driver: "light",
      authorized: false,
    });
    expect(c.driver).toBe("light");
    expect(c.authorized).toBe(false); // CLI false overrides file true
  });
});

describe("ramp steady phase after ramp-up", () => {
  it("late spawns settle to the steady 1/rate spacing", () => {
    const ramp = configSchema.parse({
      target: { host: "h" },
      ramp: { count: 40, connectRate: 10, rampUpSeconds: 1, jitter: 0 },
    }).ramp;
    const s = buildSpawnSchedule(ramp);
    // by the end, spacing has converged to steadyInterval = 1000/10 = 100ms
    const lateGap = s[s.length - 1]! - s[s.length - 2]!;
    expect(lateGap).toBe(100);
  });
});

describe("runDurationMs with an empty schedule", () => {
  it("is just hold + ramp-down when no bots are scheduled", () => {
    const ramp = configSchema.parse({ target: { host: "h" }, ramp: { holdSeconds: 60, rampDownSeconds: 5 } }).ramp;
    expect(runDurationMs(ramp, [])).toBe(65 * 1000);
  });
});

describe("registry replace on a missing id", () => {
  it("is a no-op, not a throw", () => {
    const r = new Registry();
    expect(() => r.replace(123, new FakeBot({ id: 123 }))).not.toThrow();
    expect(r.get(123)).toBeUndefined();
  });
});

describe("chatSpam stop with no running interval", () => {
  it("end before spawn is harmless", () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    chatSpam({ enabled: true, message: "x", delayMs: 500 })(bot);
    expect(() => bot.emit("end", "gone")).not.toThrow(); // stop() with null timer
    vi.advanceTimersByTime(2000);
    expect(bot.chats).toHaveLength(0);
  });
});

describe("Histogram count getter", () => {
  it("reports the number of recorded samples", () => {
    const h = new Histogram();
    h.record(1);
    h.record(2);
    expect(h.count).toBe(2);
  });
});
