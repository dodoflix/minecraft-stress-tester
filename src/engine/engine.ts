import { buildBehaviors } from "../behaviors/index.js";
import type { Config } from "../config/schema.js";
import type { Behavior, BotDriver, BotSpec } from "../drivers/driver.js";
import { FullBot } from "../drivers/full.js";
import { LightBot } from "../drivers/light.js";
import { MetricsCollector, type MetricsSnapshot } from "../metrics/collector.js";
import { AccountManager } from "../net/accounts.js";
import { ProxyPool } from "../net/proxy.js";
import { type PreflightResult, preflight } from "../net/slp.js";
import { startConsoleReporter } from "../report/console.js";
import type { RunReport } from "../report/export.js";
import { formatSummary, writeReports } from "../report/summary.js";
import { startTuiReporter } from "../report/tui.js";
import { startWebReporter } from "../report/web.js";
import { assertAuthorized } from "../safety/authorization.js";
import { backoffMs, buildSpawnSchedule, jittered, runDurationMs } from "./ramp.js";
import { Registry } from "./registry.js";

type DriverFactory = (spec: BotSpec) => BotDriver;

export interface EngineOptions {
  /** Suppress live console output (tests / programmatic runs). */
  quiet?: boolean;
  /** Override the bot driver (custom drivers, or a fake for testing). */
  driverFactory?: DriverFactory;
  /** Skip the SLP preflight (when the caller already knows the target is reachable). */
  skipPreflight?: boolean;
}

export class Engine {
  private readonly collector = new MetricsCollector();
  private readonly registry = new Registry();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly proxies: ProxyPool;
  private readonly accounts: AccountManager;
  private behaviors: Behavior[] = [];
  private factory: DriverFactory;
  private version: string | false = false;
  private preflightResult: PreflightResult | null = null;
  private shuttingDown = false;
  private resolveRun: ((s: MetricsSnapshot) => void) | null = null;
  private readonly quiet: boolean;
  private readonly skipPreflight: boolean;

  constructor(
    private readonly config: Config,
    options: EngineOptions = {},
  ) {
    this.quiet = options.quiet ?? false;
    this.skipPreflight = options.skipPreflight ?? false;
    this.proxies = new ProxyPool(config.proxies.list, config.proxies.maxPerProxy);
    this.accounts = new AccountManager(config.accounts);
    if (options.driverFactory) {
      this.factory = options.driverFactory;
    } else if (config.driver === "full") {
      this.factory = (spec) => new FullBot(spec);
    } else {
      this.factory = (spec) => new LightBot(spec);
    }
  }

  private log(line: string): void {
    if (!this.quiet) process.stdout.write(line);
  }

  async run(): Promise<MetricsSnapshot> {
    assertAuthorized(this.config);
    const { host, port } = this.config.target;

    if (!this.skipPreflight) {
      this.log(`Preflight ping ${host}:${port} ...\n`);
      this.preflightResult = await preflight(host, port, this.config.target.version);
      const p = this.preflightResult;
      this.log(
        `  ${p.versionName} (protocol ${p.protocol}) | players ${p.online}/${p.max} | ping ${p.latencyMs}ms | "${p.motd}"\n`,
      );
    }
    // Auto-negotiate by default: minecraft-protocol maps the server's protocol number
    // to a client version it supports (handles patch releases like 26.1.2 -> 26.1).
    // ponytail: auto-negotiate costs one extra status ping per bot - pin
    // `target.version` to skip it at high bot counts.
    this.version = this.config.target.version ?? false;
    this.behaviors = buildBehaviors(this.config);

    const schedule = buildSpawnSchedule(this.config.ramp);
    const total = runDurationMs(this.config.ramp, schedule);
    this.log(
      `Spawning ${schedule.length} bots (driver=${this.config.driver}), run ~${(total / 1000).toFixed(0)}s\n`,
    );

    const stopReporter = this.startReporter(schedule.length);
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

  /** Live metrics mid-run, for the control-plane API. Safe to call any time. */
  liveSnapshot(): MetricsSnapshot {
    return this.collector.snapshot();
  }

  /** Stop a run early (control-plane API / programmatic callers). Idempotent. */
  stop(reason = "stopped via API"): void {
    this.shutdown(reason);
  }

  private makeSpec(id: number): BotSpec {
    const account = this.accounts.next(id);
    return {
      id,
      username: account.username,
      host: this.config.target.host,
      port: this.config.target.port,
      version: this.version,
      auth: account.auth,
      proxy: this.proxies.acquire(),
      profilesFolder: this.config.accounts.profilesFolder,
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
    if (!this.quiet) this.log(`${formatSummary(snapshot)}\n`);

    const report: RunReport = {
      finishedAt: new Date().toISOString(),
      target: { host: this.config.target.host, port: this.config.target.port },
      preflight: this.preflightResult,
      metrics: snapshot,
    };
    for (const path of writeReports(report, this.config.report)) this.log(`Report written: ${path}\n`);

    this.resolveRun?.(snapshot);
  }

  /** Pick the live view: nothing when quiet, otherwise TUI, web, or console. */
  private startReporter(count: number): () => void {
    if (this.quiet) return () => {};
    const mode = this.config.report.mode;
    if (mode === "tui") return startTuiReporter(this.collector, this.dashboardContext(count));
    if (mode === "web")
      return startWebReporter(this.collector, this.config.report.webPort, this.dashboardContext(count));
    return startConsoleReporter(this.collector);
  }

  private dashboardContext(count: number) {
    const version = this.version === false ? "auto" : this.version;
    return {
      target: `${this.config.target.host}:${this.config.target.port}`,
      version: this.preflightResult?.versionName ?? version,
      count,
    };
  }
}
