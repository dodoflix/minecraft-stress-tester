import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock minecraft-protocol so the driver's packet/chat/lifecycle wiring can be exercised
// without a socket. createClient returns a controllable EventEmitter recorded in `holder`.
const holder = vi.hoisted(() => ({ last: null as any }));
vi.mock("minecraft-protocol", () => {
  const { EventEmitter } = require("node:events");
  return {
    default: {
      createClient: (opts: any) => {
        const c: any = new EventEmitter();
        c.opts = opts;
        c.protocolVersion = 47;
        c.throwOnWrite = false;
        c.writes = [];
        c.write = (name: string, params: any) => {
          if (c.throwOnWrite) throw new Error("bad packet");
          c.writes.push({ name, params });
        };
        c.end = (reason?: string) => {
          c.ended = reason ?? true;
        };
        holder.last = c;
        return c;
      },
    },
  };
});

import type { BotSpec } from "../src/drivers/driver.js";
import { LightBot } from "../src/drivers/light.js";

const spec = (over: Partial<BotSpec> = {}): BotSpec => ({
  id: 1,
  username: "bot",
  host: "h",
  port: 25565,
  version: false,
  auth: "offline",
  config: {} as BotSpec["config"],
  ...over,
});

function connectBot() {
  const bot = new LightBot(spec());
  const events: Record<string, unknown[]> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      const value = args.length <= 1 ? args[0] : args;
      const list = events[name];
      if (list) list.push(value);
      else events[name] = [value];
    };
  const names = [
    "connecting",
    "connected",
    "login",
    "spawned",
    "time",
    "packet",
    "latency",
    "kicked",
    "error",
    "end",
  ] as const;
  for (const e of names) bot.on(e, record(e) as any);
  bot.connect();
  return { bot, client: holder.last, events };
}

beforeEach(() => (holder.last = null));

describe("LightBot lifecycle", () => {
  it("emits connecting on connect and passes options through", () => {
    const { client, events } = connectBot();
    expect(events.connecting).toHaveLength(1);
    expect(client.opts).toMatchObject({ host: "h", port: 25565, username: "bot", keepAlive: true });
  });

  it("sets a socks connect handler when a proxy is assigned", () => {
    const bot = new LightBot(spec({ proxy: "socks5://1.2.3.4:1080" }));
    bot.connect();
    expect(typeof holder.last.opts.connect).toBe("function");
  });

  it("maps connect/login client events", () => {
    const { client, events } = connectBot();
    client.emit("connect");
    client.emit("login");
    expect(events.connected).toHaveLength(1);
    expect(events.login).toHaveLength(1);
  });

  it("emits time from update_time and counts packet bytes", () => {
    const { client, events } = connectBot();
    client.emit("packet", { age: 40n }, { name: "update_time" }, null, Buffer.alloc(9));
    expect(events.time).toEqual([40n]);
    expect(events.packet).toEqual([["update_time", 9]]);
  });

  it("counts zero bytes when fullBuffer is absent", () => {
    const { client, events } = connectBot();
    client.emit("packet", {}, { name: "keep_alive" }, null, undefined);
    expect(events.packet).toEqual([["keep_alive", 0]]);
  });

  it("does not emit time when update_time carries no age", () => {
    const { client, events } = connectBot();
    client.emit("packet", {}, { name: "update_time" }, null, Buffer.alloc(9));
    expect(events.time).toBeUndefined();
  });

  it("emits latency from player_info for our own name", () => {
    const { client, events } = connectBot();
    client.emit(
      "packet",
      { data: [{ name: "bot", ping: 55 }] },
      { name: "player_info" },
      null,
      Buffer.alloc(2),
    );
    expect(events.latency).toEqual([55]);
  });

  it("ignores player_info without our own ping", () => {
    const { client, events } = connectBot();
    client.emit(
      "packet",
      { data: [{ name: "someone", ping: 5 }] },
      { name: "player_info" },
      null,
      Buffer.alloc(2),
    );
    expect(events.latency).toBeUndefined();
  });

  it("confirms a teleport and marks spawned once on position", () => {
    const { client, events } = connectBot();
    client.emit("packet", { teleportId: 7 }, { name: "position" }, null, Buffer.alloc(4));
    client.emit("packet", { teleportId: 8 }, { name: "position" }, null, Buffer.alloc(4));
    expect(client.writes.filter((w: any) => w.name === "teleport_confirm")).toHaveLength(2);
    expect(events.spawned).toHaveLength(1); // spawned emitted once, not twice
  });

  it("spawns without a teleport id (older protocol positions)", () => {
    const { client, events } = connectBot();
    client.emit("packet", {}, { name: "position" }, null, Buffer.alloc(4));
    expect(client.writes.some((w: any) => w.name === "teleport_confirm")).toBe(false);
    expect(events.spawned).toHaveLength(1);
  });

  it("maps both kick packets to kicked with a readable reason", () => {
    const { client, events } = connectBot();
    client.emit("kick_disconnect", { reason: '{"text":"antibot"}' });
    client.emit("disconnect", { reason: { text: "full" } });
    expect(events.kicked).toEqual(["antibot", "full"]);
  });

  it("maps error and end (with and without a reason)", () => {
    const { client, events } = connectBot();
    client.emit("error", new Error("x"));
    client.emit("end", "socketClosed");
    client.emit("end", undefined);
    expect(events.error).toHaveLength(1);
    expect(events.end).toEqual(["socketClosed", "end"]);
  });
});

describe("LightBot chat", () => {
  it("uses the plain chat packet pre-1.19", () => {
    const { bot, client } = connectBot();
    client.protocolVersion = 47;
    bot.chat("hello");
    expect(client.writes.at(-1)).toEqual({ name: "chat", params: { message: "hello" } });
  });

  it("uses chat_command / chat_message on 1.19+", () => {
    const { bot, client } = connectBot();
    client.protocolVersion = 770;
    bot.chat("/login pw");
    expect(client.writes.at(-1).name).toBe("chat_command");
    bot.chat("hi");
    expect(client.writes.at(-1)).toMatchObject({ name: "chat_message", params: { message: "hi" } });
  });

  it("a failed write surfaces as an error, not a crash", () => {
    const { bot, client, events } = connectBot();
    client.throwOnWrite = true;
    bot.chat("boom");
    expect(events.error).toHaveLength(1);
  });

  it("wraps a non-Error write failure into an Error", () => {
    const { bot, client, events } = connectBot();
    client.write = () => {
      throw "raw string failure";
    };
    bot.chat("boom");
    expect(events.error).toHaveLength(1);
    expect((events.error![0] as Error).message).toContain("raw string failure");
  });
});

describe("LightBot disconnect", () => {
  it("ends the client", () => {
    const { bot, client } = connectBot();
    bot.disconnect("done");
    expect(client.ended).toBe("done");
  });

  it("chat before connect is a safe no-op", () => {
    const bot = new LightBot(spec());
    expect(() => bot.chat("hi")).not.toThrow(); // client is null
  });
});
