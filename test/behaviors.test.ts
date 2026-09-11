import { afterEach, describe, expect, it, vi } from "vitest";
import { antiAfk } from "../src/behaviors/antiAfk.js";
import { auth } from "../src/behaviors/auth.js";
import { chatSpam } from "../src/behaviors/chatSpam.js";
import { buildBehaviors } from "../src/behaviors/index.js";
import { movement } from "../src/behaviors/movement.js";
import { configSchema } from "../src/config/schema.js";
import { FakeBot, MovingFakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

describe("chatSpam behavior", () => {
  it("spams on the interval only after spawn, and stops on kick", () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    chatSpam({ enabled: true, message: "load", delayMs: 1000 })(bot);

    vi.advanceTimersByTime(3000);
    expect(bot.chats).toHaveLength(0); // not spawned yet

    bot.emit("spawned");
    vi.advanceTimersByTime(3000);
    expect(bot.chats).toEqual(["load", "load", "load"]);

    bot.emit("kicked", "afk");
    vi.advanceTimersByTime(3000);
    expect(bot.chats).toHaveLength(3); // stopped
  });

  it("cleanup stops the interval", () => {
    vi.useFakeTimers();
    const bot = new FakeBot();
    const stop = chatSpam({ enabled: true, message: "x", delayMs: 500 })(bot);
    bot.emit("spawned");
    vi.advanceTimersByTime(500);
    stop();
    vi.advanceTimersByTime(5000);
    expect(bot.chats).toHaveLength(1);
  });
});

describe("auth behavior", () => {
  it("sends register then login on spawn with the password substituted", () => {
    const bot = new FakeBot();
    auth({
      enabled: true,
      password: "s3cret",
      loginCommand: "/login {password}",
      registerCommand: "/register {password} {password}",
    })(bot);
    bot.emit("spawned");
    expect(bot.chats).toEqual(["/register s3cret s3cret", "/login s3cret"]);
  });
});

describe("antiAfk behavior", () => {
  it("rotates the head on an interval after spawn, and stops on kick", () => {
    vi.useFakeTimers();
    const bot = new MovingFakeBot();
    antiAfk({ enabled: true, intervalMs: 1000 })(bot);
    bot.emit("spawned");
    vi.advanceTimersByTime(2000);
    expect(bot.looks).toHaveLength(2);
    bot.emit("kicked", "x");
    vi.advanceTimersByTime(2000);
    expect(bot.looks).toHaveLength(2); // stopped
  });

  it("a second spawn does not double the interval; end before spawn is harmless", () => {
    vi.useFakeTimers();
    const bot = new MovingFakeBot();
    antiAfk({ enabled: true, intervalMs: 1000 })(bot);
    bot.emit("spawned");
    bot.emit("spawned"); // guard: already running
    vi.advanceTimersByTime(2000);
    expect(bot.looks).toHaveLength(2); // one interval, not two

    const other = new MovingFakeBot();
    antiAfk({ enabled: true, intervalMs: 1000 })(other);
    expect(() => other.emit("end", "x")).not.toThrow(); // stop with no timer
  });

  it("is a no-op on a driver without movement (LightBot)", () => {
    const bot = new FakeBot();
    const stop = antiAfk({ enabled: true, intervalMs: 100 })(bot);
    expect(() => {
      bot.emit("spawned");
      stop();
    }).not.toThrow();
  });
});

describe("movement behavior", () => {
  it("walks after spawn and releases forward on stop", () => {
    vi.useFakeTimers();
    const bot = new MovingFakeBot();
    movement({ enabled: true, intervalMs: 500 })(bot);
    bot.emit("spawned");
    vi.advanceTimersByTime(1000);
    expect(bot.controls.some(([c, s]) => c === "forward" && s === true)).toBe(true);
    bot.emit("end", "done");
    expect(bot.controls.at(-1)).toEqual(["forward", false]);
  });

  it("a second spawn does not restart the walk", () => {
    vi.useFakeTimers();
    const bot = new MovingFakeBot();
    movement({ enabled: true, intervalMs: 500 })(bot);
    bot.emit("spawned");
    bot.emit("spawned"); // guard
    vi.advanceTimersByTime(500);
    // one step per interval: 3 control calls (look-less), forward + jump per step
    expect(bot.controls.filter(([c]) => c === "forward")).toHaveLength(1);
  });

  it("is a no-op without movement support", () => {
    const bot = new FakeBot();
    expect(() => movement({ enabled: true, intervalMs: 100 })(bot)).not.toThrow();
  });
});

describe("buildBehaviors", () => {
  it("includes only the enabled behaviors", () => {
    const cfg = configSchema.parse({
      target: { host: "h" },
      behaviors: {
        auth: { enabled: true, password: "p" },
        chatSpam: { enabled: false },
        antiAfk: { enabled: false },
      },
    });
    expect(buildBehaviors(cfg)).toHaveLength(1); // auth only
  });

  it("antiAfk is on by default; movement off", () => {
    const cfg = configSchema.parse({ target: { host: "h" } });
    expect(buildBehaviors(cfg)).toHaveLength(1); // antiAfk
  });

  it("adds movement when enabled", () => {
    const cfg = configSchema.parse({
      target: { host: "h" },
      behaviors: { antiAfk: { enabled: false }, movement: { enabled: true } },
    });
    expect(buildBehaviors(cfg)).toHaveLength(1); // movement
  });
});
