import { describe, expect, it } from "vitest";
import type { EntityInfo, ItemInfo, Pos, Vitals } from "../src/bot/botApi.js";
import { type Blueprint, parseBlueprint, serializeBlueprint } from "../src/script/blueprint.js";
import { compileToCode } from "../src/script/compile.js";
import { runActions, runBlueprint, type ScriptableBot } from "../src/script/run.js";

class FakeScriptBot implements ScriptableBot {
  chats: string[] = [];
  commands: string[] = [];
  looks: [number, number][] = [];
  gotos: [number, number, number][] = [];
  stops = 0;
  private listeners: Record<string, ((...a: never[]) => void)[]> = {};

  chat(m: string): void {
    this.chats.push(m);
  }
  command(c: string): void {
    this.commands.push(c);
  }
  async look(yaw: number, pitch: number): Promise<void> {
    this.looks.push([yaw, pitch]);
  }
  setControl(): void {}
  async goto(x: number, y: number, z: number): Promise<void> {
    this.gotos.push([x, y, z]);
  }
  stop(): void {
    this.stops++;
  }
  position(): Pos | null {
    return null;
  }
  vitals(): Vitals | null {
    return null;
  }
  players(): string[] {
    return [];
  }
  nearbyEntities(): EntityInfo[] {
    return [];
  }
  inventory(): ItemInfo[] {
    return [];
  }
  disconnect(): void {}
  on(event: string, listener: (...a: never[]) => void): this {
    const arr = this.listeners[event] ?? [];
    arr.push(listener);
    this.listeners[event] = arr;
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners[event] ?? []) (l as (...a: unknown[]) => void)(...args);
  }
}

const tick = () => new Promise((r) => setImmediate(r));
const bp = (rules: unknown): Blueprint => {
  const r = parseBlueprint({ rules });
  if (!r.blueprint) throw new Error((r.errors ?? []).join(";"));
  return r.blueprint;
};

describe("parseBlueprint", () => {
  it("accepts a valid blueprint and defaults the name", () => {
    const r = parseBlueprint({ rules: [{ on: "spawn", actions: [{ type: "chat", message: "hi" }] }] });
    expect(r.ok).toBe(true);
    expect(r.blueprint?.name).toBe("untitled");
  });
  it("reports a JSON parse error", () => {
    const r = parseBlueprint("{ not json");
    expect(r.ok).toBe(false);
    expect(r.errors?.[0]).toMatch(/parse error/);
  });
  it("reports schema errors (unknown action, empty actions)", () => {
    expect(parseBlueprint({ rules: [{ on: "spawn", actions: [{ type: "explode" }] }] }).ok).toBe(false);
    expect(parseBlueprint({ rules: [{ on: "spawn", actions: [] }] }).ok).toBe(false);
    expect(parseBlueprint({ rules: [{ on: "boot", actions: [{ type: "stop" }] }] }).ok).toBe(false);
  });
  it("round-trips through serialize", () => {
    const original = bp([{ on: "chat", actions: [{ type: "command", command: "say hi" }] }]);
    const reparsed = parseBlueprint(serializeBlueprint(original));
    expect(reparsed.blueprint).toEqual(original);
  });
});

describe("runActions", () => {
  it("executes every action type in order, with injectable sleep", async () => {
    const bot = new FakeScriptBot();
    const slept: number[] = [];
    await runActions(
      [
        { type: "chat", message: "hi" },
        { type: "command", command: "tp 0 0 0" },
        { type: "look", yaw: 1, pitch: 2 },
        { type: "goto", x: 1, y: 2, z: 3 },
        { type: "wait", ms: 500 },
        { type: "stop" },
      ],
      bot,
      async (ms) => {
        slept.push(ms);
      },
    );
    expect(bot.chats).toEqual(["hi"]);
    expect(bot.commands).toEqual(["tp 0 0 0"]);
    expect(bot.looks).toEqual([[1, 2]]);
    expect(bot.gotos).toEqual([[1, 2, 3]]);
    expect(slept).toEqual([500]);
    expect(bot.stops).toBe(1);
  });
});

describe("runBlueprint", () => {
  it("runs spawn rules now and wires chat/death rules to events", async () => {
    const bot = new FakeScriptBot();
    runBlueprint(
      bp([
        { on: "spawn", actions: [{ type: "chat", message: "joined" }] },
        { on: "chat", actions: [{ type: "command", command: "say hi" }] },
        { on: "death", actions: [{ type: "stop" }] },
      ]),
      bot,
      async () => {},
    );
    await tick();
    expect(bot.chats).toEqual(["joined"]);

    bot.emit("chat", { username: "x", message: "yo" });
    await tick();
    expect(bot.commands).toEqual(["say hi"]);

    bot.emit("death");
    await tick();
    expect(bot.stops).toBe(1);
  });
});

describe("compileToCode", () => {
  it("emits Bot API calls for spawn and event rules", () => {
    const code = compileToCode(
      bp([
        {
          on: "spawn",
          actions: [
            { type: "chat", message: "joined" },
            { type: "goto", x: 1, y: 2, z: 3 },
          ],
        },
        {
          on: "chat",
          actions: [
            { type: "command", command: "say hi" },
            { type: "wait", ms: 100 },
          ],
        },
        { on: "death", actions: [{ type: "stop" }] },
      ]),
    );
    expect(code).toContain('bot.chat("joined")');
    expect(code).toContain("await bot.goto(1, 2, 3)");
    expect(code).toContain('bot.on("chat", async () =>');
    expect(code).toContain("setTimeout(r, 100)");
    expect(code).toContain('bot.on("death"');
    expect(code).toContain("bot.stop();");
  });
  it("handles an empty blueprint", () => {
    expect(compileToCode(bp([]))).toContain("// no rules");
  });
  it("emits completion signals for succeed and fail", () => {
    const code = compileToCode(
      bp([
        { on: "spawn", actions: [{ type: "fail", reason: "nope" }] },
        { on: "chat", actions: [{ type: "succeed" }] },
      ]),
    );
    expect(code).toContain('throw new Error("nope")');
    expect(code).toContain("return; // succeeded");
    expect(compileToCode(bp([{ on: "spawn", actions: [{ type: "fail" }] }]))).toContain(
      'throw new Error("failed")',
    );
  });
});
