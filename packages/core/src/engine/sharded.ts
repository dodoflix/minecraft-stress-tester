import { fork } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config/schema.js";
import type { MetricsSnapshot } from "../metrics/collector.js";
import { assertAuthorized } from "../safety/authorization.js";
import { mergeSnapshots, splitBudget } from "./shard.js";

/**
 * Fan a run out across N worker processes (one event loop each) to get past the
 * ~1-2k single-process ceiling, then merge their final snapshots. Each worker is this
 * same CLI re-forked with a `--shard-config` file; workers preflight and report nothing
 * (the parent writes the aggregate). I/O + process orchestration, excluded from coverage.
 */
export async function runSharded(config: Config, shards: number): Promise<MetricsSnapshot> {
  assertAuthorized(config);
  const budgets = splitBudget(config.ramp.count, shards);
  const dir = mkdtempSync(join(tmpdir(), "mcst-shards-"));
  process.stdout.write(
    `Sharding ${config.ramp.count} bots across ${budgets.length} workers: ${budgets.join(", ")}\n`,
  );

  try {
    const results = await Promise.all(budgets.map((count, i) => runWorker(config, count, i, dir)));
    return mergeSnapshots(results);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runWorker(config: Config, count: number, index: number, dir: string): Promise<MetricsSnapshot> {
  const shardConfig: Config = {
    ...config,
    shards: 1, // each worker is a single-process run
    ramp: { ...config.ramp, count },
    report: { ...config.report, json: false, csv: false, html: false, mode: "console" },
  };
  const path = join(dir, `shard-${index}.json`);
  writeFileSync(path, JSON.stringify(shardConfig), "utf8");

  return new Promise((resolve, reject) => {
    const child = fork(process.argv[1] as string, ["--shard-config", path], {
      execArgv: process.execArgv,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let snapshot: MetricsSnapshot | null = null;
    child.on("message", (msg) => {
      snapshot = msg as MetricsSnapshot;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (snapshot) resolve(snapshot);
      else reject(new Error(`shard ${index} exited (code ${code}) without a snapshot`));
    });
  });
}
