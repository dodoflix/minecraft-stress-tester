import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isReportFile, listHistory, readHistory } from "../src/history.js";

function report(finishedAt: string, spawned: number, tps: number) {
  return JSON.stringify({
    finishedAt,
    target: { host: "localhost", port: 25565 },
    preflight: null,
    metrics: { spawned, tps },
  });
}

describe("isReportFile", () => {
  it("matches mcst-*.json only, rejects traversal", () => {
    expect(isReportFile("mcst-2026-09-11T10-00-00-000Z.json")).toBe(true);
    expect(isReportFile("other.json")).toBe(false);
    expect(isReportFile("mcst-x.csv")).toBe(false);
    expect(isReportFile("../mcst-x.json")).toBe(false);
  });
});

describe("listHistory / readHistory", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcst-hist-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns an empty list for a missing directory", () => {
    expect(listHistory(join(dir, "nope"))).toEqual([]);
  });

  it("lists reports newest-first and skips non-reports and bad json", () => {
    writeFileSync(
      join(dir, "mcst-2026-09-10T00-00-00-000Z.json"),
      report("2026-09-10T00:00:00.000Z", 10, 19),
    );
    writeFileSync(
      join(dir, "mcst-2026-09-11T00-00-00-000Z.json"),
      report("2026-09-11T00:00:00.000Z", 20, 20),
    );
    writeFileSync(join(dir, "notes.txt"), "ignore me");
    writeFileSync(join(dir, "mcst-broken.json"), "{ not json");

    const list = listHistory(dir);
    expect(list.map((e) => e.finishedAt)).toEqual(["2026-09-11T00:00:00.000Z", "2026-09-10T00:00:00.000Z"]);
    expect(list[0]?.spawned).toBe(20);
    expect(list[0]?.tps).toBe(20);
  });

  it("reads one report, and guards missing/unsafe names", () => {
    writeFileSync(join(dir, "mcst-2026-09-11T00-00-00-000Z.json"), report("2026-09-11T00:00:00.000Z", 5, 18));
    expect(readHistory(dir, "mcst-2026-09-11T00-00-00-000Z.json")?.metrics.spawned).toBe(5);
    expect(readHistory(dir, "mcst-missing.json")).toBeUndefined();
    expect(readHistory(dir, "../evil.json")).toBeUndefined();
  });
});
