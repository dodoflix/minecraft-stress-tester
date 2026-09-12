import { describe, expect, it } from "vitest";
import type { DebugBot, EntityInfo, ItemInfo, Pos, Vitals } from "../src/bot/botApi.js";
import { dispatch, HELP } from "../src/bot/repl.js";

class FakeDebugBot implements DebugBot {
  chats: string[] = [];
  commands: string[] = [];
  looks: [number, number][] = [];
  gotos: [number, number, number][] = [];
  stops = 0;
  disconnects = 0;
  pos: Pos | null = { x: 1, y: 2, z: 3 };
  vit: Vitals | null = { health: 20, food: 18 };
  playerList: string[] = [];
  entities: EntityInfo[] = [];
  items: ItemInfo[] = [];

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
    return this.pos;
  }
  vitals(): Vitals | null {
    return this.vit;
  }
  players(): string[] {
    return this.playerList;
  }
  nearbyEntities(): EntityInfo[] {
    return this.entities;
  }
  inventory(): ItemInfo[] {
    return this.items;
  }
  disconnect(): void {
    this.disconnects++;
  }
}

const run = (line: string, bot: DebugBot = new FakeDebugBot()) => dispatch(line, bot);

describe("dispatch", () => {
  it("ignores blank lines", async () => {
    expect((await run("")).text).toBe("");
    expect((await run("   ")).text).toBe("");
  });

  it("treats a leading slash as a command", async () => {
    const bot = new FakeDebugBot();
    const r = await run("/gamemode creative", bot);
    expect(bot.commands).toEqual(["/gamemode creative"]);
    expect(r.text).toBe("> /gamemode creative");
  });

  it("shows help", async () => {
    expect((await run("help")).text).toBe(HELP);
    expect((await run("?")).text).toBe(HELP);
  });

  it("reports position, or notes when not spawned", async () => {
    expect((await run("pos")).text).toBe("1.0, 2.0, 3.0");
    const bot = new FakeDebugBot();
    bot.pos = null;
    expect((await run("position", bot)).text).toMatch(/not spawned/);
  });

  it("reports vitals, or unknown", async () => {
    expect((await run("health")).text).toBe("health 20.0  food 18.0");
    const bot = new FakeDebugBot();
    bot.vit = null;
    expect((await run("vitals", bot)).text).toBe("vitals unknown");
  });

  it("sends chat, rejects empty", async () => {
    const bot = new FakeDebugBot();
    expect((await run("say hi there", bot)).text).toBe("> hi there");
    expect(bot.chats).toEqual(["hi there"]);
    expect((await run("say", bot)).text).toMatch(/usage/);
  });

  it("runs commands via cmd, normalizing the slash", async () => {
    const bot = new FakeDebugBot();
    expect((await run("cmd tp 0 0 0", bot)).text).toBe("> /tp 0 0 0");
    expect((await run("cmd /kill", bot)).text).toBe("> /kill");
    expect(bot.commands).toEqual(["tp 0 0 0", "/kill"]);
    expect((await run("cmd", bot)).text).toMatch(/usage/);
  });

  it("looks with two numbers, rejects bad args", async () => {
    const bot = new FakeDebugBot();
    expect((await run("look 1.5 0.2", bot)).text).toBe("looking 1.5 0.2");
    expect(bot.looks).toEqual([[1.5, 0.2]]);
    expect((await run("look 1", bot)).text).toMatch(/usage/);
    expect((await run("look a b", bot)).text).toMatch(/usage/);
  });

  it("pathfinds with three numbers, rejects bad args", async () => {
    const bot = new FakeDebugBot();
    expect((await run("goto 10 64 -5", bot)).text).toBe("arrived near 10.0, 64.0, -5.0");
    expect(bot.gotos).toEqual([[10, 64, -5]]);
    expect((await run("goto 1 2", bot)).text).toMatch(/usage/);
    expect((await run("goto x y z", bot)).text).toMatch(/usage/);
  });

  it("lists players", async () => {
    const bot = new FakeDebugBot();
    bot.playerList = ["alice", "bob"];
    expect((await run("players", bot)).text).toBe("alice, bob");
    expect((await run("players")).text).toMatch(/no players/);
  });

  it("lists nearby entities with a default and custom radius", async () => {
    const bot = new FakeDebugBot();
    bot.entities = [{ id: 7, name: "zombie", type: "hostile", distance: 3.2 }];
    expect((await run("entities", bot)).text).toBe("#7 zombie (hostile) 3.2m");
    expect((await run("ent 5", bot)).text).toBe("#7 zombie (hostile) 3.2m");
    expect((await run("entities abc", bot)).text).toMatch(/usage/);
    expect((await run("entities")).text).toMatch(/no entities within 16.0m/);
  });

  it("lists inventory, or notes empty", async () => {
    const bot = new FakeDebugBot();
    bot.items = [{ name: "stone", count: 64, slot: 9 }];
    expect((await run("inv", bot)).text).toBe("64x stone @9");
    expect((await run("inventory")).text).toBe("inventory empty");
  });

  it("stops movement", async () => {
    const bot = new FakeDebugBot();
    expect((await run("stop", bot)).text).toBe("stopped");
    expect(bot.stops).toBe(1);
  });

  it("quits and exits, disconnecting", async () => {
    const bot = new FakeDebugBot();
    const q = await run("quit", bot);
    expect(q).toEqual({ text: "bye", done: true });
    await run("exit", bot);
    expect(bot.disconnects).toBe(2);
  });

  it("reports unknown commands", async () => {
    expect((await run("frobnicate")).text).toMatch(/unknown command: frobnicate/);
  });
});
