import { EventEmitter } from "node:events";
import type { Config } from "../config/schema.js";

/** Everything a driver needs to (re)create one bot. Held by the registry, not scraped off the client. */
export interface BotSpec {
  id: number;
  username: string;
  host: string;
  port: number;
  version: string | false; // false = auto-negotiate from server
  auth: "offline" | "microsoft";
  config: Config;
}

/** Typed lifecycle + metric events every driver emits. */
export interface BotEventMap {
  connecting: [];
  connected: []; // tcp socket up
  login: []; // join-game received
  spawned: []; // first position / in-world
  packet: [name: string, bytesIn: number];
  time: [worldAge: bigint]; // clientbound update_time — drives TPS
  latency: [pingMs: number]; // server-perceived ping (player_info)
  kicked: [reason: string];
  error: [err: Error];
  end: [reason: string];
}

export type BotEvent = keyof BotEventMap;

/** Minimal typed EventEmitter — avoids the untyped stock `.on/.emit`. */
export class TypedEmitter<M extends { [K in keyof M]: unknown[] }> {
  private readonly ee = new EventEmitter();
  on<E extends keyof M>(e: E, l: (...a: M[E]) => void): this {
    this.ee.on(e as string, l as (...a: unknown[]) => void);
    return this;
  }
  emit<E extends keyof M>(e: E, ...a: M[E]): void {
    this.ee.emit(e as string, ...a);
  }
}

export interface BotDriver extends TypedEmitter<BotEventMap> {
  readonly spec: BotSpec;
  connect(): void;
  disconnect(reason?: string): void;
  /** Best-effort chat/command send (version-aware). Used by chat/auth behaviors. */
  chat(message: string): void;
}

/** A behavior wires itself to a driver's events and returns a cleanup fn. */
export type Behavior = (bot: BotDriver) => () => void;
