import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MetricsCollector } from "../src/metrics/collector.js";
import type { RunReport } from "../src/report/export.js";
import { toCsv, toHtml, writeCsvReport, writeHtmlReport } from "../src/report/export.js";
import { FakeBot } from "./helpers/fakeBot.js";

function report(): RunReport {
  const c = new MetricsCollector();
  const b = new FakeBot();
  c.track(b);
  b.reachSpawn();
  b.emit("kicked", "antibot, banned");
  b.emit("latency", 25);
  return {
    finishedAt: "2026-09-11T00:00:00.000Z",
    target: { host: "h", port: 25565 },
    preflight: null,
    metrics: c.snapshot(),
  };
}

describe("toCsv", () => {
  it("emits a metric,value header and known rows", () => {
    const csv = toCsv(report());
    expect(csv.startsWith("metric,value\n")).toBe(true);
    expect(csv).toContain("\nspawned,1\n");
    expect(csv).toContain("timeToConnectMs.p95,");
    expect(csv).toContain("serverPingMs.p50,25");
  });
  it("quotes cells containing commas", () => {
    expect(toCsv(report())).toContain('"kick.antibot, banned"');
  });
});

describe("toHtml", () => {
  it("is a self-contained document with the target and stats", () => {
    const html = toHtml(report());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("h:25565");
    expect(html).toContain("Est. server TPS");
    expect(html).toContain("antibot"); // kick reason listed
  });
  it("escapes HTML-special characters in reasons", () => {
    const r = report();
    r.metrics.kickReasons = { "<script>": 1 };
    expect(toHtml(r)).toContain("&lt;script&gt;");
  });

  it("omits the kick section when there were no kicks", () => {
    const r = report();
    r.metrics.kickReasons = {};
    expect(toHtml(r)).not.toContain("Kick reasons");
  });

  it("shows the preflight version and 'n/a' ping when there are no ping samples", () => {
    const r = report();
    r.preflight = { motd: "x", versionName: "Paper 1.21", protocol: 5, online: 0, max: 20, latencyMs: 3 };
    r.metrics.serverPingMs = { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
    const html = toHtml(r);
    expect(html).toContain("Paper 1.21");
    expect(html).toContain("n/a");
  });
});

describe("writeCsvReport / writeHtmlReport", () => {
  it("write parseable files and return their paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcst-fmt-"));
    try {
      const r = report();
      const csvPath = writeCsvReport(dir, r);
      const htmlPath = writeHtmlReport(dir, r);
      expect(csvPath.endsWith(".csv")).toBe(true);
      expect(htmlPath.endsWith(".html")).toBe(true);
      expect(readFileSync(csvPath, "utf8")).toContain("metric,value");
      expect(readFileSync(htmlPath, "utf8")).toContain("<!doctype html>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
