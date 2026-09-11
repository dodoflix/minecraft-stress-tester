import type { Config } from "../config/schema.js";
import type { BotDriver, BotSpec, Behavior } from "../drivers/driver.js";
import { LightBot } from "../drivers/light.js";
import { buildBehaviors } from "../behaviors/index.js";
import { MetricsCollector, type MetricsSnapshot } from "../metrics/collector.js";
import { assertAuthorized } from "../safety/authorization.js";
import { preflight, type PreflightResult } from "../net/slp.js";
import { buildSpawnSchedule, runDurationMs, jittered, backoffMs } from "./ramp.js";
import { Registry } from "./registry.js";
import { makeUsername } from "../util/names.js";
import { startConsoleReporter } from "../report/console.js";
import { writeJsonReport } from "../report/export.js";

type DriverFactory = (spec: BotSpec) => BotDriver;

/** quiet: suppress live console output (used by tests / programmatic runs). */
export interface EngineOptions {
  quiet?: boolean;
}

export class Engine {
  private readonly collector = new MetricsCollector();
  private readonly registry = new Registry();
  private readonly timers = new Set<NodeJS.Timeout>();
  private behaviors: Behavior[] = [];
  private factory: DriverFactory;
  private version: string | false = false;
  private preflightResult: PreflightResult | null = null;
  private shuttingDown = false;
  private resolveRun: ((s: MetricsSnapshot) => void) | null = null;
  private readonly quiet: boolean;

  constructor(private readonly config: Config, options: EngineOptions = {}) {
    this.quiet = options.quiet ?? false;
    if (config.driver === "full") {
      throw new Error("The 'full' (mineflayer) driver is not implemented yet — use driver: light.");
    }
    this.factory = (spec) => new LightBot(spec);
  }

  private log(line: string): void {
    if (!this.quiet) process.stdout.write(line);
  }

  async run(): Promise<MetricsSnapshot> {
    assertAuthorized(this.config);
    const { host, port } = this.config.target;

    this.log(`Preflight ping ${host}:${port} ...\n`);
    this.preflightResult = await preflight(host, port, this.config.target.version);
    const p = this.preflightResult;
    this.log(
      `  ${p.versionName} (protocol ${p.protocol}) | players ${p.online}/${p.max} | ping ${p.latencyMs}ms | "${p.motd}"\n`,
    );
    // Auto-negotiate by default: minecraft-protocol maps the server's protocol number
    // to a client version it supports (handles patch releases like 26.1.2 -> 26.1).
    // ponytail: auto-negotiate costs one extra status ping per bot — pin
    // `target.version` to skip it at high bot counts.
    this.version = this.config.target.version ?? false;
    this.behaviors = buildBehaviors(this.config);

    const schedule = buildSpawnSchedule(this.config.ramp);
    const total = runDurationMs(this.config.ramp, schedule);
    this.log(`Spawning ${schedule.length} bots (driver=light), run ~${(total / 1000).toFixed(0)}s\n`);

    const stopReporter = this.quiet ? () => {} : startConsoleReporter(this.collector);
    const onSigint = () => this.shutdown("SIGINT");
    process.once("SIGINT", onSigint);

    for (let i = 0; i < schedule.length; i++) {
      this.setTimer(jittered(schedule[i]!, this.config.ramp.jitter), () => this.spawn(i));
    }
    this.setTimer(total, () => this.shutdown("duration reached"));

    return new Promise<MetricsSnapshot>((resolve) => {
      this.resolveRun = (s) => {
        stopReporter();
        process.removeListener("SIGINT", onSigint);
        resolve(s);
      };
    });
  }

  private makeSpec(id: number): BotSpec {
    return {
      id,
      username: makeUsername(this.config.accounts.usernamePrefix, id),
      host: this.config.target.host,
      port: this.config.target.port,
      version: this.version,
      auth: this.config.accounts.mode,
      config: this.config,
    };
  }

  private spawn(id: number): void {
    if (this.shuttingDown) return;
    this.launch(this.makeSpec(id), true);
  }

  private launch(spec: BotSpec, fresh: boolean): void {
    const bot = this.factory(spec);
    this.collector.track(bot);
    for (const behavior of this.behaviors) behavior(bot);
    if (fresh) this.registry.add(bot, spec);
    else this.registry.replace(spec.id, bot);

    const onGone = () => this.scheduleReconnect(spec);
    bot.on("end", onGone);
    // A kick emits both 'kicked' and (usually) 'end'; reconnect is driven off 'end' only
    // to avoid double-scheduling. 'kicked' is left for metrics.
    bot.connect();
  }

  private scheduleReconnect(spec: BotSpec): void {
    if (this.shuttingDown || !this.config.reconnect.enabled) return;
    const retries = this.registry.incRetry(spec.id);
    if (retries > this.config.reconnect.maxRetries) {
      this.registry.remove(spec.id);
      return;
    }
    const delay = backoffMs(retries, this.config.reconnect.baseBackoffMs, this.config.reconnect.maxBackoffMs);
    this.setTimer(delay, () => {
      if (!this.shuttingDown) this.launch(spec, false);
    });
  }

  private setTimer(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private shutdown(reason: string): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.log(`\nShutting down (${reason}) ...\n`);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const e of this.registry.all()) e.bot.disconnect("run_complete");

    const snapshot = this.collector.snapshot();
    if (!this.quiet) printSummary(snapshot);
    if (this.config.report.json) {
      const path = writeJsonReport(this.config.report.dir, {
        finishedAt: new Date().toISOString(),
        target: { host: this.config.target.host, port: this.config.target.port },
        preflight: this.preflightResult,
        metrics: snapshot,
      });
      this.log(`Report written: ${path}\n`);
    }
    this.resolveRun?.(snapshot);
  }
}

function printSummary(s: ReturnType<MetricsCollector["snapshot"]>): void {
  const lines = [
    "",
    "=== Run summary ===",
    `duration:        ${(s.elapsedMs / 1000).toFixed(1)}s`,
    `attempted:       ${s.attempted}`,
    `spawned:         ${s.spawned} (${(s.connectSuccessRate * 100).toFixed(1)}% of attempts)`,
    `peak logged-in:  ${s.loggedIn}`,
    `kicked/errors:   ${s.kicked} / ${s.errors}`,
    `est. server TPS: ${s.tps.toFixed(1)}`,
    `time-to-connect: p50=${s.timeToConnectMs.p50}ms p95=${s.timeToConnectMs.p95}ms p99=${s.timeToConnectMs.p99}ms`,
    `time-to-spawn:   p50=${s.timeToSpawnMs.p50}ms p95=${s.timeToSpawnMs.p95}ms p99=${s.timeToSpawnMs.p99}ms`,
    `inbound total:   ${s.packetsIn} pkts / ${(s.bytesIn / 1024 / 1024).toFixed(2)} MB`,
  ];
  if (Object.keys(s.kickReasons).length) {
    lines.push("kick reasons:");
    for (const [reason, n] of Object.entries(s.kickReasons)) lines.push(`  ${n}x  ${reason}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}
