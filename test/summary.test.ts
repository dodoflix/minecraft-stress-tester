import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configSchema } from "../src/config/schema.js";
import { MetricsCollector } from "../src/metrics/collector.js";
import type { RunReport } from "../src/report/export.js";
import { formatSummary, writeReports } from "../src/report/summary.js";
import { FakeBot } from "./helpers/fakeBot.js";

function reportWith(withPing: boolean): RunReport {
  const c = new MetricsCollector();
  const b = new FakeBot();
  c.track(b);
  b.reachSpawn();
  b.emit("kicked", "antibot");
  if (withPing) b.emit("latency", 20);
  return {
    finishedAt: "2026-09-11T00:00:00.000Z",
    target: { host: "h", port: 25565 },
    preflight: null,
    metrics: c.snapshot(),
  };
}

describe("formatSummary", () => {
  it("includes headline stats and kick reasons", () => {
    const out = formatSummary(reportWith(false).metrics);
    expect(out).toContain("Run summary");
    expect(out).toContain("spawned:         1");
    expect(out).toContain("est. server TPS");
    expect(out).toContain("server ping:     n/a");
    expect(out).toContain("1x  antibot");
  });
  it("shows ping percentiles when present", () => {
    expect(formatSummary(reportWith(true).metrics)).toContain("server ping:     p50=20ms");
  });
});

describe("writeReports", () => {
  const opts = (over: Record<string, unknown>) =>
    configSchema.parse({ target: { host: "h" }, report: over }).report;

  it("writes only the enabled formats", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcst-rep-"));
    try {
      const paths = writeReports(reportWith(false), opts({ dir, json: true, csv: true, html: false }));
      expect(paths).toHaveLength(2);
      const files = readdirSync(dir).sort();
      expect(files.some((f) => f.endsWith(".json"))).toBe(true);
      expect(files.some((f) => f.endsWith(".csv"))).toBe(true);
      expect(files.some((f) => f.endsWith(".html"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes html when enabled", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcst-rep-"));
    try {
      const paths = writeReports(reportWith(false), opts({ dir, json: false, csv: false, html: true }));
      expect(paths).toHaveLength(1);
      expect(readdirSync(dir)[0]?.endsWith(".html")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes nothing when all formats are off", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcst-rep-"));
    try {
      expect(writeReports(reportWith(false), opts({ dir, json: false }))).toHaveLength(0);
      expect(readdirSync(dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
