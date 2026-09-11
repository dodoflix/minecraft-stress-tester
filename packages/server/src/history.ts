import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunReport } from "minecraft-stress-tester";

export interface RunHistoryEntry {
  file: string;
  finishedAt: string;
  target: { host: string; port: number };
  spawned: number;
  tps: number;
}

// Report files are written as mcst-<iso-with-:.replaced>.json; only serve those.
const REPORT_FILE = /^mcst-[\w-]+\.json$/;

export function isReportFile(name: string): boolean {
  return REPORT_FILE.test(name) && !name.includes("..");
}

/** Read the reports directory into a newest-first list of run summaries. */
export function listHistory(dir: string): RunHistoryEntry[] {
  if (!existsSync(dir)) return [];
  const entries: RunHistoryEntry[] = [];
  for (const file of readdirSync(dir)) {
    if (!isReportFile(file)) continue;
    try {
      const report = JSON.parse(readFileSync(join(dir, file), "utf8")) as RunReport;
      entries.push({
        file,
        finishedAt: report.finishedAt,
        target: report.target,
        spawned: report.metrics.spawned,
        tps: report.metrics.tps,
      });
    } catch {
      // Skip an unreadable/partial report rather than failing the whole listing.
    }
  }
  return entries.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
}

/** Read one full report by file name, or undefined if missing/unsafe. */
export function readHistory(dir: string, file: string): RunReport | undefined {
  if (!isReportFile(file)) return undefined;
  const path = join(dir, file);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as RunReport;
}
