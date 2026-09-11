import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configSchema } from "../src/config/schema.js";
import { Engine } from "../src/engine/engine.js";
import { AuthorizationError } from "../src/safety/authorization.js";
import { FakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

function engineWith(configPatch: Record<string, unknown>) {
  const created: FakeBot[] = [];
  const config = configSchema.parse({
    authorized: true,
    target: { host: "h" },
    report: { json: false },
    ...configPatch,
  });
  const engine = new Engine(config, {
    quiet: true,
    skipPreflight: true,
    driverFactory: (spec) => {
      const b = new FakeBot(spec);
      created.push(b);
      return b;
    },
  });
  return { engine, created };
}

describe("Engine orchestration", () => {
  it("spawns exactly `count` bots, stays quiet, and returns a snapshot", async () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const { engine, created } = engineWith({
      ramp: { count: 3, connectRate: 50, holdSeconds: 0, jitter: 0 },
    });

    const p = engine.run();
    await vi.advanceTimersByTimeAsync(500);
    const snap = await p;

    expect(created).toHaveLength(3);
    expect(snap.attempted).toBe(3);
    expect(writeSpy).not.toHaveBeenCalled(); // quiet
    writeSpy.mockRestore();
  });

  it("respawns a dropped bot with backoff, up to maxRetries, then gives up", async () => {
    vi.useFakeTimers();
    const { engine, created } = engineWith({
      ramp: { count: 1, connectRate: 50, holdSeconds: 5, jitter: 0 },
      reconnect: { enabled: true, maxRetries: 2, baseBackoffMs: 10, maxBackoffMs: 100 },
    });

    const p = engine.run();
    await vi.advanceTimersByTimeAsync(50);
    expect(created).toHaveLength(1);

    created[0]!.emit("end", "drop");
    await vi.advanceTimersByTimeAsync(200);
    expect(created).toHaveLength(2); // retry 1

    created[1]!.emit("end", "drop");
    await vi.advanceTimersByTimeAsync(200);
    expect(created).toHaveLength(3); // retry 2

    created[2]!.emit("end", "drop");
    await vi.advanceTimersByTimeAsync(200);
    expect(created).toHaveLength(3); // exceeded maxRetries -> no more

    await vi.advanceTimersByTimeAsync(6000); // hit run duration -> shutdown
    await p;
  });

  it("does not respawn when reconnect is disabled", async () => {
    vi.useFakeTimers();
    const { engine, created } = engineWith({
      ramp: { count: 1, connectRate: 50, holdSeconds: 5, jitter: 0 },
      reconnect: { enabled: false },
    });
    const p = engine.run();
    await vi.advanceTimersByTimeAsync(50);
    created[0]!.emit("end", "drop");
    await vi.advanceTimersByTimeAsync(2000);
    expect(created).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(6000);
    await p;
  });

  it("rejects an unauthorized run before generating any load", async () => {
    const { engine, created } = engineWith({ authorized: false });
    await expect(engine.run()).rejects.toBeInstanceOf(AuthorizationError);
    expect(created).toHaveLength(0);
  });

  it("draws the TUI dashboard when report.mode is tui", async () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const config = configSchema.parse({
        authorized: true,
        target: { host: "h" },
        ramp: { count: 1, connectRate: 50, holdSeconds: 0, jitter: 0 },
        report: { json: false, mode: "tui" },
      });
      const engine = new Engine(config, { skipPreflight: true, driverFactory: (s) => new FakeBot(s) });
      const p = engine.run();
      await vi.advanceTimersByTimeAsync(500);
      await p;
      const out = writeSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(out).toContain("Minecraft Stress Tester");
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("throws for the unimplemented full driver when no factory is supplied", () => {
    const config = configSchema.parse({ target: { host: "h" }, driver: "full" });
    expect(() => new Engine(config)).toThrow(/full/);
  });

  it("ignores a late end after shutdown (no reconnect scheduled)", async () => {
    vi.useFakeTimers();
    const { engine, created } = engineWith({
      ramp: { count: 1, connectRate: 50, holdSeconds: 0, jitter: 0 },
      reconnect: { enabled: true, maxRetries: 5, baseBackoffMs: 10, maxBackoffMs: 100 },
    });
    const p = engine.run();
    await vi.advanceTimersByTimeAsync(500); // spawn then shutdown (hold 0)
    await p;
    expect(created).toHaveLength(1);

    created[0]!.emit("end", "late"); // shuttingDown -> scheduleReconnect early-returns
    await vi.advanceTimersByTimeAsync(500);
    expect(created).toHaveLength(1);
  });

  it("prints a summary with no kick reasons when nothing was kicked", async () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const config = configSchema.parse({
        authorized: true,
        target: { host: "h" },
        ramp: { count: 1, connectRate: 50, holdSeconds: 0, jitter: 0 },
        report: { json: false },
      });
      const engine = new Engine(config, { skipPreflight: true, driverFactory: (s) => new FakeBot(s) });
      const p = engine.run();
      await vi.advanceTimersByTimeAsync(500);
      await p;
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(output).toContain("Run summary");
      expect(output).not.toContain("kick reasons");
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("prints a summary and writes a JSON report when not quiet", async () => {
    vi.useFakeTimers();
    const dir = mkdtempSync(join(tmpdir(), "mcst-eng-"));
    const created: FakeBot[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const config = configSchema.parse({
        authorized: true,
        target: { host: "h" },
        ramp: { count: 1, connectRate: 50, holdSeconds: 0, jitter: 0 },
        report: { json: true, dir },
      });
      const engine = new Engine(config, {
        skipPreflight: true,
        driverFactory: (spec) => {
          const b = new FakeBot(spec);
          created.push(b);
          b.on("connecting", () => b.emit("kicked", "antibot")); // produce a kick reason for the summary
          return b;
        },
      });

      const p = engine.run();
      await vi.advanceTimersByTimeAsync(500);
      await p;

      expect(writeSpy).toHaveBeenCalled(); // summary printed
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      expect(files).toHaveLength(1);
    } finally {
      writeSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
