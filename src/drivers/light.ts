import mc from "minecraft-protocol";
import { TypedEmitter, type BotDriver, type BotEventMap, type BotSpec } from "./driver.js";
import { longToBigInt } from "../util/long.js";

/**
 * Lightweight raw-protocol bot. No world/chunk parsing — just the login handshake,
 * teleport confirmation to reach the in-world state, and metric-bearing packets.
 * Scales to ~1-2k per process because it skips everything mineflayer does.
 */
export class LightBot extends TypedEmitter<BotEventMap> implements BotDriver {
  readonly spec: BotSpec;
  private client: mc.Client | null = null;
  private spawned = false;

  constructor(spec: BotSpec) {
    super();
    this.spec = spec;
  }

  connect(): void {
    this.emit("connecting");
    // `version: false` = auto-negotiate from the server ping. minecraft-protocol's
    // types omit the `false` literal, so build options loosely.
    const options: any = {
      host: this.spec.host,
      port: this.spec.port,
      username: this.spec.username,
      auth: this.spec.auth,
      version: this.spec.version,
      keepAlive: true,
    };
    const client = mc.createClient(options);
    this.client = client;

    client.on("connect", () => this.emit("connected"));

    // Join-game marks a successful login (state -> play).
    client.on("login", () => this.emit("login"));

    // Every inbound packet: name for rate, fullBuffer length for byte throughput.
    client.on("packet", (data, meta, _buffer, fullBuffer) => {
      this.emit("packet", meta.name, fullBuffer?.length ?? 0);
      if (meta.name === "update_time" && data?.age !== undefined) {
        this.emit("time", longToBigInt(data.age));
      }
      // First position packet = in-world. Confirm the teleport or the server parks us in limbo.
      if (meta.name === "position") {
        if (data?.teleportId !== undefined) {
          this.safeWrite("teleport_confirm", { teleportId: data.teleportId });
        }
        if (!this.spawned) {
          this.spawned = true;
          this.emit("spawned");
        }
      }
    });

    // Play-state kick and login-state kick carry a chat-component reason.
    const onKick = (packet: { reason?: unknown }) => this.emit("kicked", stringifyReason(packet?.reason));
    client.on("kick_disconnect", onKick);
    client.on("disconnect", onKick);

    client.on("error", (err: Error) => this.emit("error", err));
    client.on("end", (reason: string) => this.emit("end", reason ?? "end"));
  }

  disconnect(reason = "client_quit"): void {
    this.client?.end(reason);
    this.client = null;
  }

  chat(message: string): void {
    const isCommand = message.startsWith("/");
    // ponytail: pre-1.19 (protocol < 759) plain chat is reliable; signed chat / chat_command
    // on 1.19+ needs signing that only FullBot (mineflayer) does properly. Best-effort here.
    const proto = this.client?.protocolVersion ?? 0;
    if (proto >= 759) {
      if (isCommand) {
        this.safeWrite("chat_command", { command: message.slice(1), timestamp: BigInt(Date.now()), salt: 0n, argumentSignatures: [], messageCount: 0, acknowledged: Buffer.alloc(3) });
      } else {
        this.safeWrite("chat_message", { message });
      }
    } else {
      this.safeWrite("chat", { message });
    }
  }

  /** Writes throw if the packet shape is wrong for this version; swallow so one bot can't crash the run. */
  private safeWrite(name: string, params: object): void {
    try {
      this.client?.write(name, params);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }
}

function stringifyReason(reason: unknown): string {
  if (reason == null) return "unknown";
  if (typeof reason === "string") {
    try {
      const parsed = JSON.parse(reason);
      return stringifyReason(parsed);
    } catch {
      return reason;
    }
  }
  const r = reason as Record<string, unknown>;
  if (typeof r.text === "string") return r.text || "unknown";
  if (typeof r.translate === "string") return r.translate;
  return JSON.stringify(reason);
}
