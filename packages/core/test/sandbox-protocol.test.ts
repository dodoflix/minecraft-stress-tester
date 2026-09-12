import { describe, expect, it, vi } from "vitest";
import type { DebugBot } from "../src/bot/botApi.js";
import { dispatchScriptCall, isScriptBotMethod, SCRIPT_BOT_METHODS } from "../src/script/sandbox/protocol.js";

function fakeBot(overrides: Partial<Record<string, unknown>> = {}): DebugBot {
  return {
    chat: vi.fn(),
    command: vi.fn(),
    look: vi.fn(async () => {}),
    setControl: vi.fn(),
    goto: vi.fn(async () => {}),
    stop: vi.fn(),
    position: () => ({ x: 1, y: 2, z: 3 }),
    vitals: () => ({ health: 20, food: 20 }),
    players: () => ["a"],
    nearbyEntities: () => [],
    inventory: () => [],
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    ...overrides,
  } as unknown as DebugBot;
}

describe("isScriptBotMethod", () => {
  it("allows the listed methods and rejects everything else", () => {
    for (const m of SCRIPT_BOT_METHODS) expect(isScriptBotMethod(m)).toBe(true);
    expect(isScriptBotMethod("disconnect")).toBe(false);
    expect(isScriptBotMethod("constructor")).toBe(false);
    expect(isScriptBotMethod(42)).toBe(false);
  });
});

describe("dispatchScriptCall", () => {
  it("calls an allowlisted method and returns its value", async () => {
    const bot = fakeBot();
    expect(await dispatchScriptCall(bot, "position", [])).toEqual({ x: 1, y: 2, z: 3 });
    await dispatchScriptCall(bot, "chat", ["hi"]);
    expect(bot.chat).toHaveBeenCalledWith("hi");
  });

  it("awaits async methods", async () => {
    const bot = fakeBot({ goto: vi.fn(async () => "arrived") });
    expect(await dispatchScriptCall(bot, "goto", [1, 2, 3])).toBe("arrived");
  });

  it("rejects a non-allowlisted method (even a real DebugBot one)", async () => {
    await expect(dispatchScriptCall(fakeBot(), "disconnect", [])).rejects.toThrow("not allowed");
    await expect(dispatchScriptCall(fakeBot(), "toString", [])).rejects.toThrow("not allowed");
  });

  it("rejects when the method is missing on the bot and tolerates non-array args", async () => {
    const bot = fakeBot({ stop: undefined });
    await expect(dispatchScriptCall(bot, "stop", [])).rejects.toThrow("unavailable");
    await dispatchScriptCall(fakeBot(), "chat", "hi" as unknown as unknown[]);
  });
});
