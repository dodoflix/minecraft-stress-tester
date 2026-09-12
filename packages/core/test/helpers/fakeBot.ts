import {
  type BotDriver,
  type BotEventMap,
  type BotSpec,
  type ControlState,
  TypedEmitter,
} from "../../src/drivers/driver.js";

/**
 * In-memory BotDriver for testing the engine/collector/pipeline stages against the driver
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

/** A FakeBot that also has movement (like FullBot), for antiAfk / movement behavior tests. */
export class MovingFakeBot extends FakeBot {
  readonly looks: [number, number][] = [];
  readonly controls: [ControlState, boolean][] = [];

  look(yaw: number, pitch: number): void {
    this.looks.push([yaw, pitch]);
  }

  setControlState(control: ControlState, state: boolean): void {
    this.controls.push([control, state]);
  }
}
