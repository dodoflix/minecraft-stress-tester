import { type Bot, createBot } from "mineflayer";
// mineflayer-pathfinder is CommonJS; import the whole module and pull members off it.
import pathfinderModule from "mineflayer-pathfinder";
import { type BotSpec, type ControlState, TypedEmitter } from "../drivers/driver.js";

/** Events the debug/scripting layer subscribes to on one bot. */
export interface BotApiEventMap {
  chat: [{ username: string; message: string }];
  death: [];
  kicked: [reason: string];
  end: [reason: string];
  error: [err: Error];
}

export interface Pos {
  x: number;
  y: number;
  z: number;
}
export interface Vitals {
  health: number;
  food: number;
}
export interface EntityInfo {
  id: number;
  name: string;
  type: string;
  distance: number;
}
export interface ItemInfo {
  name: string;
  count: number;
  slot: number;
}

/**
 * The stable, single-bot programmatic interface. The debug REPL and the blueprint interpreter
 * both drive a bot only through this surface, so it is defined once here and kept small. BotApi
 * is the mineflayer-backed implementation; tests drive the REPL against a fake that implements
 * this interface.
 */
export interface DebugBot {
  chat(message: string): void;
  /** Run a server command. The leading slash is added if missing. */
  command(command: string): void;
  look(yaw: number, pitch: number): Promise<void>;
  setControl(state: ControlState, on: boolean): void;
  /** Pathfind to a block position; resolves on arrival. */
  goto(x: number, y: number, z: number): Promise<void>;
  /** Clear movement controls and cancel any active pathfinding. */
  stop(): void;
  position(): Pos | null;
  vitals(): Vitals | null;
  players(): string[];
  nearbyEntities(radius: number): EntityInfo[];
  inventory(): ItemInfo[];
  disconnect(reason?: string): void;
}

const { pathfinder, Movements, goals } = pathfinderModule as unknown as {
  pathfinder: (bot: Bot) => void;
  Movements: new (bot: Bot) => unknown;
  goals: { GoalNear: new (x: number, y: number, z: number, range: number) => unknown };
};

/**
 * mineflayer-backed DebugBot. Networked, so it is exercised by the real-server integration
 * test and excluded from the unit coverage run (the REPL logic that consumes it is tested).
 */
export class BotApi extends TypedEmitter<BotApiEventMap> implements DebugBot {
  private constructor(private readonly bot: Bot) {
    super();
    this.wire();
  }

  /** Connect one bot and resolve once it has spawned into the world. */
  static connect(spec: BotSpec): Promise<BotApi> {
    const bot = createBot({
      host: spec.host,
      port: spec.port,
      username: spec.username,
      auth: spec.auth,
      version: spec.version,
      hideErrors: true,
      profilesFolder: spec.profilesFolder,
      viewDistance: spec.config.viewDistance,
    } as unknown as Parameters<typeof createBot>[0]);
    bot.loadPlugin(pathfinder as unknown as (b: Bot) => void);

    return new Promise((resolve, reject) => {
      bot.once("spawn", () => {
        bot.pathfinder.setMovements(new Movements(bot) as never);
        resolve(new BotApi(bot));
      });
      bot.once("error", reject);
      bot.once("end", (reason: string) => reject(new Error(`disconnected before spawn: ${reason}`)));
    });
  }

  private wire(): void {
    this.bot.on("chat", (username: string, message: string) => this.emit("chat", { username, message }));
    this.bot.on("death", () => this.emit("death"));
    this.bot.on("kicked", (reason: unknown) => this.emit("kicked", String(reason)));
    this.bot.on("end", (reason: string) => this.emit("end", reason ?? "end"));
    this.bot.on("error", (err: unknown) =>
      this.emit("error", err instanceof Error ? err : new Error(String(err))),
    );
  }

  chat(message: string): void {
    this.bot.chat(message);
  }

  command(command: string): void {
    this.bot.chat(command.startsWith("/") ? command : `/${command}`);
  }

  look(yaw: number, pitch: number): Promise<void> {
    return this.bot.look(yaw, pitch, true);
  }

  setControl(state: ControlState, on: boolean): void {
    this.bot.setControlState(state as Parameters<Bot["setControlState"]>[0], on);
  }

  async goto(x: number, y: number, z: number): Promise<void> {
    await this.bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1) as never);
  }

  stop(): void {
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();
  }

  position(): Pos | null {
    const p = this.bot.entity?.position;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  vitals(): Vitals | null {
    if (this.bot.health === undefined) return null;
    return { health: this.bot.health, food: this.bot.food };
  }

  players(): string[] {
    return Object.keys(this.bot.players ?? {});
  }

  nearbyEntities(radius: number): EntityInfo[] {
    const self = this.bot.entity?.position;
    if (!self) return [];
    const out: EntityInfo[] = [];
    for (const e of Object.values(this.bot.entities)) {
      if (!e || e === this.bot.entity || !e.position) continue;
      const distance = self.distanceTo(e.position);
      if (distance > radius) continue;
      out.push({
        id: e.id,
        name: e.name ?? e.username ?? e.displayName ?? "unknown",
        type: String(e.type ?? "unknown"),
        distance,
      });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  inventory(): ItemInfo[] {
    return this.bot.inventory.items().map((i) => ({ name: i.name, count: i.count, slot: i.slot }));
  }

  disconnect(reason = "debug session ended"): void {
    this.bot.quit(reason);
  }
}
