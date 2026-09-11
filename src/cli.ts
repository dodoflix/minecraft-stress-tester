#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config/load.js";
import { Engine } from "./engine/engine.js";
import { AuthorizationError } from "./safety/authorization.js";

const program = new Command();
program
  .name("mcst")
  .description("Minecraft server stress tester — authorized testing only.")
  .option("-c, --config <path>", "config file (.yaml or .json)")
  .option("-H, --host <host>", "target host")
  .option("-p, --port <port>", "target port", (v) => parseInt(v, 10))
  .option("-n, --count <n>", "number of bots", (v) => parseInt(v, 10))
  .option("-d, --driver <driver>", "bot driver: light | full")
  .option("--mc-version <ver>", "force Minecraft version (default: auto-detect)")
  .option("--i-am-authorized", "affirm you own or are permitted to test the target")
  .parse();

const opts = program.opts();

async function main(): Promise<void> {
  const config = loadConfig(opts.config, {
    host: opts.host,
    port: opts.port,
    count: opts.count,
    driver: opts.driver,
    version: opts.mcVersion,
    authorized: opts.iAmAuthorized ? true : undefined,
  });
  await new Engine(config).run();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (err instanceof AuthorizationError) {
      process.stderr.write("\n" + err.message + "\n");
      process.exit(2);
    }
    process.stderr.write(`\nError: ${err?.message ?? err}\n`);
    process.exit(1);
  });
