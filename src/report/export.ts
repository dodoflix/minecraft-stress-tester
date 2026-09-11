import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetricsSnapshot } from "../metrics/collector.js";
import type { PreflightResult } from "../net/slp.js";

export interface RunReport {
  finishedAt: string;
  target: { host: string; port: number };
  preflight: PreflightResult | null;
  metrics: MetricsSnapshot;
}

/** Write the final run report as JSON. Returns the path. CSV/HTML land in a later phase. */
export function writeJsonReport(dir: string, report: RunReport): string {
  mkdirSync(dir, { recursive: true });
  const stamp = report.finishedAt.replace(/[:.]/g, "-");
  const path = join(dir, `mcst-${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}
