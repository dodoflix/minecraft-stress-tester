import { describe, it, expect, vi, afterEach } from "vitest";
import { chatSpam } from "../src/behaviors/chatSpam.js";
import { auth } from "../src/behaviors/auth.js";
import { buildBehaviors } from "../src/behaviors/index.js";
import { configSchema } from "../src/config/schema.js";
import { FakeBot } from "./helpers/fakeBot.js";

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

describe("buildBehaviors", () => {
  it("includes only enabled behaviors", () => {
    const cfg = configSchema.parse({
      target: { host: "h" },
      behaviors: { auth: { enabled: true, password: "p" }, chatSpam: { enabled: false } },
    });
    // auth on, chatSpam off -> exactly one behavior
    expect(buildBehaviors(cfg)).toHaveLength(1);
  });

  it("is empty when nothing is enabled", () => {
    const cfg = configSchema.parse({ target: { host: "h" } });
    expect(buildBehaviors(cfg)).toHaveLength(0);
  });
});
