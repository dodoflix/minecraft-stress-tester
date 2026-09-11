import { type BotDriver, type BotEventMap, type BotSpec, TypedEmitter } from "../../src/drivers/driver.js";

/**
 * In-memory BotDriver for testing the engine/collector/behaviors against the driver
 * *contract* (events + chat), with no network. Tests drive it by emitting lifecycle
 * events and asserting on observed behavior (chat calls, disconnects), so they verify
 * logic, not the LightBot implementation.
 */
export class FakeBot extends TypedEmitter<BotEventMap> implements BotDriver {
  readonly spec: BotSpec;
  readonly chats: string[] = [];
  connected = false;
  disconnectedReason: string | undefined;

  constructor(spec: Partial<BotSpec> = {}) {
    super();
    this.spec = {
      id: 0,
      username: "test",
      host: "localhost",
      port: 25565,
      version: false,
      auth: "offline",
      config: {} as BotSpec["config"],
      ...spec,
    };
  }

  connect(): void {
    this.connected = true;
    this.emit("connecting");
  }

  disconnect(reason = "quit"): void {
    this.connected = false;
    this.disconnectedReason = reason;
  }

  chat(message: string): void {
    this.chats.push(message);
  }

  /** Convenience: play the whole happy-path lifecycle. */
  reachSpawn(): void {
    this.emit("connected");
    this.emit("login");
    this.emit("spawned");
  }
}
