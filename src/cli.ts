#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { Command } from "commander";
import { loadConfig } from "./config/load.js";
import { configSchema } from "./config/schema.js";
import { Engine } from "./engine/engine.js";
import { runSharded } from "./engine/sharded.js";
import type { PreflightResult } from "./net/slp.js";
import { formatSummary, writeReports } from "./report/summary.js";
import { AuthorizationError } from "./safety/authorization.js";

const program = new Command();
program
  .name("mcst")
  .description("Minecraft server stress tester - authorized testing only.")
  .option("-c, --config <path>", "config file (.yaml or .json)")
  .option("-H, --host <host>", "target host")
  .option("-p, --port <port>", "target port", (v) => parseInt(v, 10))
  .option("-n, --count <n>", "number of bots", (v) => parseInt(v, 10))
  .option("-d, --driver <driver>", "bot driver: light | full")
  .option("-s, --shards <n>", "run across N worker processes (>2k bots)", (v) => parseInt(v, 10))
  .option("--mc-version <ver>", "force Minecraft version (default: auto-detect)")
  .option("--view-distance <n>", "chunk view distance per bot (default 2, lower = lighter)", (v) =>
    parseInt(v, 10),
  )
  .option("--scenario <name>", "load profile: join-flood | sustained-load | chat-flood | chunk-thrash")
  .option("--tui", "full-screen live dashboard instead of console lines")
  .option("--web", "serve a live web dashboard")
  .option("--web-port <port>", "web dashboard port (default 8787)", (v) => parseInt(v, 10))
  .option("--csv", "also write a CSV report")
  .option("--html", "also write an HTML report")
  .option("--shard-config <path>", "internal: run one shard from a serialized config")
  .option("--i-am-authorized", "affirm you own or are permitted to test the target")
  .parse();

const opts = program.opts();

async function main(): Promise<void> {
  // Shard-worker mode: run the given config quietly and hand the snapshot to the parent.
  if (opts.shardConfig) {
    const config = configSchema.parse(JSON.parse(readFileSync(opts.shardConfig, "utf8")));
    const snapshot = await new Engine(config, { quiet: true }).run();
    process.send?.(snapshot);
    return;
  }

  const config = loadConfig(opts.config, {
    host: opts.host,
    port: opts.port,
    count: opts.count,
    driver: opts.driver,
    version: opts.mcVersion,
    viewDistance: opts.viewDistance,
    shards: opts.shards,
    scenario: opts.scenario,
    tui: opts.tui,
    web: opts.web,
    webPort: opts.webPort,
    csv: opts.csv,
    html: opts.html,
    authorized: opts.iAmAuthorized ? true : undefined,
  });

  // Big single-process runs are CPU-bound: minecraft-protocol fully parses every inbound
  // packet on one thread. Nudge toward sharding across cores.
  if (config.ramp.count >= 500 && config.shards <= 1) {
    const n = Math.max(2, cpus().length);
    process.stderr.write(
      `Tip: ${config.ramp.count} bots in one process is CPU-bound (the client parses every packet).\n` +
        `     For less client-side lag, spread across cores with --shards ${n}, and pin --mc-version.\n\n`,
    );
  }

  if (config.shards > 1) {
    const snapshot = await runSharded(config, config.shards);
    process.stdout.write(`${formatSummary(snapshot)}\n`);
    const preflight: PreflightResult | null = null; // per-shard; aggregate report omits it
    for (const path of writeReports(
      { finishedAt: new Date().toISOString(), target: config.target, preflight, metrics: snapshot },
      config.report,
    )) {
      process.stdout.write(`Report written: ${path}\n`);
    }
    return;
  }

  await new Engine(config).run();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (err instanceof AuthorizationError) {
      process.stderr.write(`\n${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`\nError: ${err?.message ?? err}\n`);
    process.exit(1);
  });
