#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Command } from "commander";
import { BotApi } from "./bot/botApi.js";
import { dispatch } from "./bot/repl.js";
import { loadConfig } from "./config/load.js";
import { configSchema } from "./config/schema.js";
import type { BotSpec } from "./drivers/driver.js";
import { Engine } from "./engine/engine.js";
import { runSharded } from "./engine/sharded.js";
import { resolveAutoProxies } from "./net/autoProxies.js";
import { isLocalHost } from "./net/proxy.js";
import type { PreflightResult } from "./net/slp.js";
import { formatSummary, writeReports } from "./report/summary.js";
import { AuthorizationError, assertAuthorized } from "./safety/authorization.js";
import { scan } from "./scan/scanner.js";
import { formatScanReport } from "./scan/scanReport.js";
import { parseBlueprint } from "./script/blueprint.js";
import { compileToCode } from "./script/compile.js";
import { runBlueprint } from "./script/run.js";
import { runUserScript } from "./script/sandbox/host.js";
import type { StartServer } from "./serverContract.js";

// serve/gui are the only CLI paths that need the control-plane server. It lives in a sibling
// workspace (@mcst/server) that depends on core; loading it lazily with a non-literal specifier
// keeps core buildable on its own (no import cycle) and off the hot path for every other command.
async function loadStartServer(): Promise<StartServer> {
  const spec = "@mcst/server";
  const mod = (await import(spec)) as unknown as { startServer: StartServer };
  return mod.startServer;
}

const program = new Command();
program
  .name("mcst")
  // Without this, options after a subcommand (e.g. `gui --port 9000`) are swallowed by the
  // program's same-named options and never reach the subcommand handler.
  .enablePositionalOptions()
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
  .action(runCommand);

program
  .command("serve")
  .description("run the control-plane API daemon (REST + live metrics over SSE)")
  .option("-p, --port <port>", "listen port (default 8080)", (v) => parseInt(v, 10))
  .option("--host <host>", "bind address (default 127.0.0.1; localhost only by default)")
  .option("--token <token>", "fixed API token (default: generate a random one)")
  .option("--reports-dir <dir>", "run history directory (default ./reports)")
  .option("--configs-dir <dir>", "config store directory (default ./configs)")
  .action(serveCommand);

program
  .command("gui")
  .description("launch the web control panel (start/stop runs, edit configs, browse reports)")
  .option("-p, --port <port>", "listen port (default 8080)", (v) => parseInt(v, 10))
  .option("--host <host>", "bind address (default 127.0.0.1)")
  .option("--reports-dir <dir>", "run history directory (default ./reports)")
  .option("--configs-dir <dir>", "config store directory (default ./configs)")
  .action(guiCommand);

program
  .command("debug")
  .description("attach one bot and drive it from an interactive console (develop against a server)")
  .option("-c, --config <path>", "config file (.yaml or .json)")
  .option("-H, --host <host>", "target host")
  .option("-p, --port <port>", "target port", (v) => parseInt(v, 10))
  .option("--mc-version <ver>", "force Minecraft version (default: auto-detect)")
  .option("--script <file>", "run a bot blueprint (.json) on the attached bot")
  .option("--user-script <file>", "run a sandboxed user JS script (.js) against the bot, then exit")
  .option("--script-timeout <ms>", "wall-clock cap for --user-script (default 30000)", (v) => parseInt(v, 10))
  .option("--i-am-authorized", "affirm you own or are permitted to test the target")
  .action(debugCommand);

const scriptCmd = program.command("script").description("work with bot blueprints (programmable bots)");
scriptCmd
  .command("validate <file>")
  .description("validate a blueprint JSON file")
  .action((file: string) => {
    const result = parseBlueprint(readFileSync(file, "utf8"));
    if (result.ok) process.stdout.write("valid\n");
    else {
      process.stderr.write(`invalid:\n  ${(result.errors ?? []).join("\n  ")}\n`);
      process.exitCode = 1;
    }
  });
scriptCmd
  .command("eject <file> [out]")
  .description("compile a blueprint to an editable TypeScript module")
  .action((file: string, out: string | undefined) => {
    const result = parseBlueprint(readFileSync(file, "utf8"));
    if (!result.ok || !result.blueprint) {
      process.stderr.write(`invalid blueprint:\n  ${(result.errors ?? []).join("\n  ")}\n`);
      process.exitCode = 1;
      return;
    }
    const code = compileToCode(result.blueprint);
    if (out) {
      writeFileSync(out, code, "utf8");
      process.stdout.write(`Wrote ${out}\n`);
    } else {
      process.stdout.write(code);
    }
  });

program
  .command("scan")
  .description("defensive best-effort security scan of a server you own (fingerprint + advisories)")
  .option("-c, --config <path>", "config file (.yaml or .json)")
  .option("-H, --host <host>", "target host")
  .option("-p, --port <port>", "target port", (v) => parseInt(v, 10))
  .option("--mc-version <ver>", "force Minecraft version (default: auto-detect)")
  .option("--deep", "join one bot to detect plugins (brand + plugin channels + command tab-complete)")
  .option(
    "--probe-versions",
    "with --deep, best-effort plugin versions via read-only /version (unlocks CVE matching)",
  )
  .option("--json", "also write the report as JSON to the reports dir")
  .option("--i-am-authorized", "affirm you own or are permitted to test the target")
  .action(scanCommand);

async function runCommand(opts: Record<string, unknown>): Promise<void> {
  // Shard-worker mode: run the given config quietly and hand the snapshot to the parent.
  if (opts.shardConfig) {
    const config = configSchema.parse(JSON.parse(readFileSync(opts.shardConfig as string, "utf8")));
    // Workers skip preflight: it would be N redundant direct pings from the real IP (defeating
    // proxies), and bots auto-negotiate the version anyway.
    const snapshot = await new Engine(config, { quiet: true, skipPreflight: true }).run();
    process.send?.(snapshot);
    return;
  }

  const config = loadConfig(opts.config as string | undefined, {
    host: opts.host as string | undefined,
    port: opts.port as number | undefined,
    count: opts.count as number | undefined,
    driver: opts.driver as "light" | "full" | undefined,
    version: opts.mcVersion as string | undefined,
    viewDistance: opts.viewDistance as number | undefined,
    shards: opts.shards as number | undefined,
    scenario: opts.scenario as never,
    tui: opts.tui as boolean | undefined,
    web: opts.web as boolean | undefined,
    webPort: opts.webPort as number | undefined,
    csv: opts.csv as boolean | undefined,
    html: opts.html as boolean | undefined,
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

  if (config.proxies.auto) {
    if (isLocalHost(config.target.host)) {
      process.stderr.write(
        `Warning: ${config.target.host} is a local/private address. Proxies connect from their own\n` +
          "         machine, so they cannot reach a server on your LAN; validation will find 0 usable.\n" +
          "         Auto-proxies only works against a public server IP.\n",
      );
    }
    process.stdout.write("Fetching + validating free public proxies (untrusted third parties) ...\n");
    let lastLog = 0;
    config.proxies.list = await resolveAutoProxies(config.target, {
      providers: config.proxies.autoProviders,
      validate: config.proxies.autoValidate,
      max: config.proxies.autoMax,
      overfetch: config.proxies.autoOverfetch,
      perProxy: config.proxies.maxPerProxy,
      maxProbes: config.proxies.autoMaxProbes,
      concurrency: config.proxies.autoConcurrency,
      timeoutMs: config.proxies.autoTimeoutMs,
      onProgress: ({ checked, total, ok }) => {
        const now = Date.now();
        if (now - lastLog > 1000) {
          lastLog = now;
          process.stdout.write(`  probed ${checked}/${total}, ${ok} usable\r`);
        }
      },
    });
    process.stdout.write(`\nUsing ${config.proxies.list.length} free proxies.\n`);
    // Running direct after asking for proxies would send the real IP; refuse instead.
    if (config.proxies.list.length === 0) {
      throw new Error(
        "No usable proxies found, refusing to run direct (that would expose your real IP). " +
          "Target a public server the proxies can reach, or remove proxies.auto to run without proxies.",
      );
    }
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

async function serveCommand(opts: Record<string, unknown>): Promise<void> {
  const startServer = await loadStartServer();
  const handle = await startServer({
    port: opts.port as number | undefined,
    host: opts.host as string | undefined,
    token: opts.token as string | undefined,
    reportsDir: opts.reportsDir as string | undefined,
    configsDir: opts.configsDir as string | undefined,
  });
  process.stdout.write(`Control-plane API listening on ${handle.url}\n`);
  process.stdout.write(`API token: ${handle.token}\n`);
  process.stdout.write("Pass it as `Authorization: Bearer <token>` or `?token=<token>`.\n");
  process.once("SIGINT", () => {
    void handle.close().then(() => process.exit(0));
  });
}

async function guiCommand(opts: Record<string, unknown>): Promise<void> {
  const startServer = await loadStartServer();
  const handle = await startServer({
    port: opts.port as number | undefined,
    host: opts.host as string | undefined,
    reportsDir: opts.reportsDir as string | undefined,
    configsDir: opts.configsDir as string | undefined,
  });
  process.stdout.write(`Web control panel: ${handle.url}\n`);
  process.stdout.write("Open that URL in your browser (the page carries its API token). Ctrl+C to stop.\n");
  process.once("SIGINT", () => {
    void handle.close().then(() => process.exit(0));
  });
}

async function debugCommand(opts: Record<string, unknown>): Promise<void> {
  const config = loadConfig(opts.config as string | undefined, {
    host: opts.host as string | undefined,
    port: opts.port as number | undefined,
    version: opts.mcVersion as string | undefined,
    authorized: opts.iAmAuthorized ? true : undefined,
  });
  assertAuthorized(config);

  const spec: BotSpec = {
    id: 0,
    username: `${config.accounts.usernamePrefix}-debug`,
    host: config.target.host,
    port: config.target.port,
    version: config.target.version ?? false,
    auth: config.accounts.mode,
    profilesFolder: config.accounts.profilesFolder,
    config,
  };

  process.stdout.write(`Connecting to ${spec.host}:${spec.port} ...\n`);
  const bot = await BotApi.connect(spec);
  process.stdout.write("Spawned.\n");

  // Headless sandbox runner: run untrusted user JS in an isolate against this bot, then exit.
  if (opts.userScript) {
    const code = readFileSync(opts.userScript as string, "utf8");
    process.stdout.write(`Running sandboxed script ${opts.userScript} ...\n`);
    try {
      await runUserScript(bot, code, {
        timeoutMs: opts.scriptTimeout as number | undefined,
        onLog: (level, args) => process.stdout.write(`[${level}] ${args.join(" ")}\n`),
      });
      process.stdout.write("Script finished.\n");
    } catch (err) {
      process.stderr.write(`Script error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
    bot.disconnect();
    process.exit(process.exitCode ?? 0);
  }

  process.stdout.write('Type "help" for commands.\n');
  if (opts.script) {
    const result = parseBlueprint(readFileSync(opts.script as string, "utf8"));
    if (!result.ok || !result.blueprint) {
      process.stderr.write(`blueprint invalid:\n  ${(result.errors ?? []).join("\n  ")}\n`);
    } else {
      runBlueprint(result.blueprint, bot);
      process.stdout.write(`Running blueprint "${result.blueprint.name}".\n`);
    }
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "mcst> " });
  bot.on("chat", ({ username, message }) => process.stdout.write(`\n[chat] <${username}> ${message}\n`));
  bot.on("kicked", (reason) => process.stdout.write(`\n[kicked] ${reason}\n`));
  bot.on("end", () => {
    process.stdout.write("\n[disconnected]\n");
    rl.close();
  });

  rl.prompt();
  rl.on("line", async (line) => {
    const result = await dispatch(line, bot);
    if (result.text) process.stdout.write(`${result.text}\n`);
    if (result.done) rl.close();
    else rl.prompt();
  });
  rl.on("close", () => {
    bot.disconnect();
    process.exit(0);
  });
}

async function scanCommand(opts: Record<string, unknown>): Promise<void> {
  const config = loadConfig(opts.config as string | undefined, {
    host: opts.host as string | undefined,
    port: opts.port as number | undefined,
    version: opts.mcVersion as string | undefined,
    authorized: opts.iAmAuthorized ? true : undefined,
  });
  assertAuthorized(config);

  const spec: BotSpec | undefined = opts.deep
    ? {
        id: 0,
        username: `${config.accounts.usernamePrefix}-scan`,
        host: config.target.host,
        port: config.target.port,
        version: config.target.version ?? false,
        auth: config.accounts.mode,
        profilesFolder: config.accounts.profilesFolder,
        config,
      }
    : undefined;

  process.stdout.write(`Scanning ${config.target.host}:${config.target.port} ...\n`);
  const report = await scan(
    { host: config.target.host, port: config.target.port, version: config.target.version },
    { deep: Boolean(opts.deep), probeVersions: Boolean(opts.probeVersions), spec },
  );
  process.stdout.write(`${formatScanReport(report)}\n`);

  if (opts.json) {
    mkdirSync(config.report.dir, { recursive: true });
    const path = join(config.report.dir, `mcst-scan-${report.scannedAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
    process.stdout.write(`Report written: ${path}\n`);
  }
}

program.parseAsync().catch((err) => {
  if (err instanceof AuthorizationError) {
    process.stderr.write(`\n${err.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`\nError: ${err?.message ?? err}\n`);
  process.exit(1);
});
