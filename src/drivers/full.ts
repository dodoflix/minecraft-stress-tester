import { type Bot, createBot } from "mineflayer";
import { makeSocksConnect } from "../net/socksConnect.js";
import { longToBigInt } from "../util/long.js";
import { extractOwnPing } from "../util/playerPing.js";
import { stringifyReason } from "../util/reason.js";
import { type BotDriver, type BotEventMap, type BotSpec, type ControlState, TypedEmitter } from "./driver.js";

/**
 * Full mineflayer client: parses the world, so it can move, load chunks, and interact,
 * at the cost of much higher CPU/memory per bot (~tens to low-hundreds per process).
 * Use it for realistic game-logic load; use LightBot for raw connection scale.
 *
 * Networking is exercised by the real-server integration test and excluded from the
 * unit coverage run.
 */
export class FullBot extends TypedEmitter<BotEventMap> implements BotDriver {
  readonly spec: BotSpec;
  private bot: Bot | null = null;
  private spawned = false;

  constructor(spec: BotSpec) {
    super();
    this.spec = spec;
  }

  connect(): void {
    this.emit("connecting");
    // mineflayer's options type omits version:false (auto-negotiate), so cast at the edge.
    const options: Record<string, unknown> = {
      host: this.spec.host,
      port: this.spec.port,
      username: this.spec.username,
      auth: this.spec.auth,
      version: this.spec.version,
      hideErrors: true,
      profilesFolder: this.spec.profilesFolder,
    };
    if (this.spec.proxy) options.connect = makeSocksConnect(this.spec.proxy, this.spec.host, this.spec.port);
    const bot = createBot(options as unknown as Parameters<typeof createBot>[0]);
    this.bot = bot;

    bot.on("login", () => {
      this.emit("connected");
      this.emit("login");
    });
    bot.on("spawn", () => {
      if (!this.spawned) {
        this.spawned = true;
        this.emit("spawned");
      }
    });
    bot.on("kicked", (reason: unknown) => this.emit("kicked", stringifyReason(reason)));
    bot.on("error", (err: unknown) =>
      this.emit("error", err instanceof Error ? err : new Error(String(err))),
    );
    bot.on("end", (reason: string) => this.emit("end", reason ?? "end"));

    // Metric-bearing packets off the underlying protocol client (mineflayer handles
    // teleport confirmation and world state itself).
    bot._client.on("packet", (data: unknown, meta: { name: string }, _b: unknown, full?: Buffer) => {
      this.emit("packet", meta.name, full?.length ?? 0);
      if (meta.name === "update_time") {
        const age = (data as { age?: unknown }).age;
        if (age !== undefined) this.emit("time", longToBigInt(age));
      }
      if (meta.name === "player_info" || meta.name === "player_info_update") {
        const ping = extractOwnPing(data, this.spec.username);
        if (ping !== undefined) this.emit("latency", ping);
      }
    });
  }

  disconnect(reason = "client_quit"): void {
    this.bot?.quit(reason);
    this.bot = null;
  }

  chat(message: string): void {
    this.bot?.chat(message);
  }

  look(yaw: number, pitch: number): void {
    void this.bot?.look(yaw, pitch, true);
  }

  setControlState(control: ControlState, state: boolean): void {
    this.bot?.setControlState(control as Parameters<Bot["setControlState"]>[0], state);
  }
}
