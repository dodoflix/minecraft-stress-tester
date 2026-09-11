import type { BotDriver } from "../drivers/driver.js";
import { Histogram } from "./histogram.js";
import { TpsEstimator } from "./tps.js";

export interface MetricsSnapshot {
  elapsedMs: number;
  attempted: number;
  connected: number;
  loggedIn: number;
  spawned: number;
  active: number;
  ended: number;
  kicked: number;
  errors: number;
  connectSuccessRate: number; // spawned / attempted
  packetsIn: number;
  bytesIn: number;
  packetsPerSec: number;
  bytesPerSec: number;
  tps: number;
  timeToConnectMs: ReturnType<Histogram["summary"]>;
  timeToSpawnMs: ReturnType<Histogram["summary"]>;
  serverPingMs: ReturnType<Histogram["summary"]>;
  kickReasons: Record<string, number>;
}

/** Central event sink. One instance per run; every bot is track()ed into it. */
export class MetricsCollector {
  private readonly startMs = Date.now();
  private attempted = 0;
  private connected = 0;
  private loggedIn = 0;
  private spawned = 0;
  private ended = 0;
  private kicked = 0;
  private errors = 0;
  private active = 0;
  private packetsIn = 0;
  private bytesIn = 0;

  private readonly connectMs = new Histogram();
  private readonly spawnMs = new Histogram();
  private readonly serverPing = new Histogram();
  private readonly kickReasons = new Map<string, number>();
  private readonly tps = new TpsEstimator();

  /** A bot could not be launched because no proxy was free (proxies required). Counts as a failed attempt. */
  recordUnavailableProxy(): void {
    this.attempted++;
    this.errors++;
  }

  track(bot: BotDriver): void {
    const t0 = Date.now();
    this.attempted++;
    let counted = false; // guard double-counting active on odd event orders

    bot.on("connected", () => {
      this.connected++;
      this.connectMs.record(Date.now() - t0);
      if (!counted) {
        counted = true;
        this.active++;
      }
    });
    bot.on("login", () => this.loggedIn++);
    bot.on("spawned", () => {
      this.spawned++;
      this.spawnMs.record(Date.now() - t0);
    });
    bot.on("packet", (_name, bytes) => {
      this.packetsIn++;
      this.bytesIn += bytes;
    });
    bot.on("time", (age) => this.tps.record(age, Date.now()));
    bot.on("latency", (pingMs) => this.serverPing.record(pingMs));
    bot.on("kicked", (reason) => {
      this.kicked++;
      this.kickReasons.set(reason, (this.kickReasons.get(reason) ?? 0) + 1);
    });
    bot.on("error", () => this.errors++);
    bot.on("end", () => {
      this.ended++;
      if (counted) {
        counted = false;
        this.active--;
      }
    });
  }

  snapshot(): MetricsSnapshot {
    const elapsedMs = Date.now() - this.startMs;
    const secs = elapsedMs / 1000 || 1;
    return {
      elapsedMs,
      attempted: this.attempted,
      connected: this.connected,
      loggedIn: this.loggedIn,
      spawned: this.spawned,
      active: this.active,
      ended: this.ended,
      kicked: this.kicked,
      errors: this.errors,
      connectSuccessRate: this.attempted ? this.spawned / this.attempted : 0,
      packetsIn: this.packetsIn,
      bytesIn: this.bytesIn,
      packetsPerSec: this.packetsIn / secs,
      bytesPerSec: this.bytesIn / secs,
      tps: this.tps.current(),
      timeToConnectMs: this.connectMs.summary(),
      timeToSpawnMs: this.spawnMs.summary(),
      serverPingMs: this.serverPing.summary(),
      kickReasons: Object.fromEntries(this.kickReasons),
    };
  }
}
