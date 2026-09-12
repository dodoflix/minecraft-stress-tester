import { afterEach, describe, expect, it, vi } from "vitest";
import { configSchema, stageSchema } from "../src/config/schema.js";
import type { StageContext } from "../src/pipeline/stage.js";
import { buildPipeline, stageFactory } from "../src/pipeline/stdlib.js";
import { FakeBot, MovingFakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

const NOT_SPAWNED: StageContext = { spawned: () => false };
const SPAWNED: StageContext = { spawned: () => true };
const make = (use: string, withOpts: Record<string, unknown> = {}) =>
  stageFactory(stageSchema.parse({ use, with: withOpts } as any));

describe("auth stage", () => {
  const opts = { password: "s3cret", delayMs: 1000 };

  it("sends register then login after the delay, and resolves succeeded", async () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    const h = make("auth", opts)(bot, NOT_SPAWNED);
    bot.emit("login");
    expect(bot.chats).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(bot.chats).toEqual(["/register s3cret s3cret", "/login s3cret"]);
    await expect(h.done).resolves.toEqual({ status: "succeeded" });
  });

  it("re-authenticates on a second join and cleans up on stop", () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    const h = make("auth", opts)(bot, NOT_SPAWNED);
    bot.emit("login");
    vi.advanceTimersByTime(1000);
    bot.emit("login");
    vi.advanceTimersByTime(1000);
    expect(bot.chats).toHaveLength(4);
    h.stop();
    bot.emit("login");
    vi.advanceTimersByTime(2000);
    expect(bot.chats).toHaveLength(4);
  });
});

describe("commands stage", () => {
  it("runs the list once, staggered, then resolves succeeded", async () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    const h = make("commands", { list: ["/survival", "/kit"], delayMs: 1000 })(bot, NOT_SPAWNED);
    bot.emit("spawned");
    vi.advanceTimersByTime(1000);
    expect(bot.chats).toEqual(["/survival"]);
    vi.advanceTimersByTime(1000);
    expect(bot.chats).toEqual(["/survival", "/kit"]);
    await expect(h.done).resolves.toEqual({ status: "succeeded" });
    bot.emit("spawned");
    vi.advanceTimersByTime(5000);
    expect(bot.chats).toHaveLength(2); // not re-run
  });

  it("is a no-op (done) with an empty list", async () => {
    const h = make("commands", { list: [] })(new FakeBot(), NOT_SPAWNED);
    await expect(h.done).resolves.toEqual({ status: "done" });
    expect(() => h.stop()).not.toThrow();
  });

  it("stop clears pending commands", () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    const h = make("commands", { list: ["/a", "/b"], delayMs: 1000 })(bot, NOT_SPAWNED);
    bot.emit("spawned");
    vi.advanceTimersByTime(1000);
    expect(bot.chats).toEqual(["/a"]);
    h.stop();
    vi.advanceTimersByTime(5000);
    expect(bot.chats).toEqual(["/a"]); // /b never sent
  });
});

describe("chatSpam stage", () => {
  it("advances immediately and spams on the interval after spawn; stop halts it", async () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    const h = make("chatSpam", { message: "load", delayMs: 1000 })(bot, NOT_SPAWNED);
    await expect(h.done).resolves.toEqual({ status: "succeeded" });
    vi.advanceTimersByTime(3000);
    expect(bot.chats).toHaveLength(0); // not spawned
    bot.emit("spawned");
    vi.advanceTimersByTime(3000);
    expect(bot.chats).toEqual(["load", "load", "load"]);
    h.stop();
    vi.advanceTimersByTime(3000);
    expect(bot.chats).toHaveLength(3);
  });

  it("starts immediately when the bot has already spawned", () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    make("chatSpam", { message: "x", delayMs: 500 })(bot, SPAWNED);
    vi.advanceTimersByTime(1000);
    expect(bot.chats).toHaveLength(2);
  });
});

describe("antiAfk stage", () => {
  it("rotates on an interval after spawn; a second spawn does not double it", () => {
    vi.useFakeTimers();
    const bot = new MovingFakeBot();
    const h = make("antiAfk", { intervalMs: 1000 })(bot, NOT_SPAWNED);
    bot.emit("spawned");
    bot.emit("spawned");
    vi.advanceTimersByTime(2000);
    expect(bot.looks).toHaveLength(2);
    h.stop();
    vi.advanceTimersByTime(2000);
    expect(bot.looks).toHaveLength(2); // stopped
  });

  it("is a done no-op on a driver without movement", async () => {
    const h = make("antiAfk", { intervalMs: 1000 })(new FakeBot(), NOT_SPAWNED);
    await expect(h.done).resolves.toEqual({ status: "done" });
    expect(() => h.stop()).not.toThrow();
  });
});

describe("movement stage", () => {
  it("walks after spawn and releases forward on stop", () => {
    vi.useFakeTimers();
    const bot = new MovingFakeBot();
    const h = make("movement", { intervalMs: 500 })(bot, NOT_SPAWNED);
    bot.emit("spawned");
    vi.advanceTimersByTime(1000);
    expect(bot.controls.some(([c, s]) => c === "forward" && s === true)).toBe(true);
    h.stop();
    expect(bot.controls.at(-1)).toEqual(["forward", false]);
  });

  it("is a done no-op without movement support", async () => {
    const h = make("movement", { intervalMs: 1000 })(new FakeBot(), NOT_SPAWNED);
    await expect(h.done).resolves.toEqual({ status: "done" });
  });
});

describe("blueprint stage", () => {
  const run = async (actions: unknown[]) => {
    const bot = new FakeBot();
    const h = make("blueprint", { blueprint: { name: "b", rules: [{ on: "spawn", actions }] } })(
      bot,
      SPAWNED,
    );
    return { result: await h.done, bot };
  };

  it("runs spawn actions over the driver and reports the completion signal", async () => {
    const { result, bot } = await run([
      { type: "chat", message: "hi" },
      { type: "command", command: "list" },
      { type: "succeed" },
    ]);
    expect(result).toEqual({ status: "succeeded" });
    expect(bot.chats).toEqual(["hi", "/list"]);
  });

  it("reports failed with a reason", async () => {
    const { result } = await run([{ type: "fail", reason: "nope" }]);
    expect(result).toEqual({ status: "failed", reason: "nope" });
  });

  it("reports done when no signal is given", async () => {
    const { result } = await run([{ type: "chat", message: "x" }]);
    expect(result).toEqual({ status: "done" });
  });

  it("ignores non-spawn rules and resolves once across repeated spawns", async () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    const h = make("blueprint", {
      blueprint: {
        name: "b",
        rules: [
          { on: "chat", actions: [{ type: "chat", message: "ignored" }] },
          { on: "spawn", actions: [{ type: "chat", message: "hi" }, { type: "succeed" }] },
        ],
      },
    })(bot, NOT_SPAWNED);
    bot.emit("spawned");
    bot.emit("spawned"); // second spawn: must not re-run or re-resolve
    await expect(h.done).resolves.toEqual({ status: "succeeded" });
    expect(bot.chats).toEqual(["hi"]);
  });

  it("no-ops look and stop on a driver without movement", async () => {
    const { result } = await run([{ type: "look", yaw: 1, pitch: 0 }, { type: "stop" }, { type: "succeed" }]);
    expect(result).toEqual({ status: "succeeded" });
  });

  it("drives look, goto and stop over the adapter and stop() is safe", async () => {
    const bot = new MovingFakeBot();
    const h = stageFactory(
      stageSchema.parse({
        use: "blueprint",
        with: {
          blueprint: {
            name: "b",
            rules: [
              {
                on: "spawn",
                actions: [
                  { type: "look", yaw: 1, pitch: 0 },
                  { type: "wait", ms: 0 },
                  { type: "goto", x: 0, y: 0, z: 0 },
                  { type: "stop" },
                ],
              },
            ],
          },
        },
      }),
    )(bot, SPAWNED);
    await h.done;
    expect(bot.looks).toEqual([[1, 0]]);
    expect(bot.controls.at(-1)).toEqual(["forward", false]);
    expect(() => h.stop()).not.toThrow();
  });
});

describe("buildPipeline", () => {
  it("maps config.pipeline to ordered resolved stages with gating", () => {
    const cfg = configSchema.parse({
      target: { host: "h" },
      pipeline: [{ use: "auth" }, { use: "chatSpam", onFailure: "stop", retries: 2 }],
    });
    const stages = buildPipeline(cfg);
    expect(stages.map((s) => s.kind)).toEqual(["auth", "chatSpam"]);
    expect(stages[1]?.onFailure).toBe("stop");
    expect(stages[1]?.retries).toBe(2);
  });

  it("defaults to an empty pipeline", () => {
    expect(buildPipeline(configSchema.parse({ target: { host: "h" } }))).toEqual([]);
  });
});
