import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatLine, startConsoleReporter } from "../src/report/console.js";
import { writeJsonReport } from "../src/report/export.js";
import { MetricsCollector } from "../src/metrics/collector.js";
import { FakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

function snapshotWithOneSpawn() {
  const c = new MetricsCollector();
  const b = new FakeBot();
  c.track(b);
  b.reachSpawn();
  b.emit("packet", "x", 100);
  return { collector: c, snapshot: c.snapshot() };
}

describe("formatLine", () => {
  it("includes the headline stats", () => {
    const line = formatLine(snapshotWithOneSpawn().snapshot);
    expect(line).toContain("spawned=1/1(100%)");
    expect(line).toContain("tps~");
    expect(line).toContain("active=");
    expect(line).toContain("kick=0 err=0");
  });

  it("renders byte rates with a unit suffix", () => {
    // large byte count -> KB/MB path exercised
    const c = new MetricsCollector();
    const b = new FakeBot();
    c.track(b);
    b.emit("packet", "big", 5 * 1024 * 1024);
    expect(formatLine(c.snapshot())).toMatch(/(KB|MB|B)\/s/);
  });
});

describe("startConsoleReporter", () => {
  it("writes a line each interval and stops when told", () => {
    vi.useFakeTimers();
    const { collector } = snapshotWithOneSpawn();
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stop = startConsoleReporter(collector, 1000);
    vi.advanceTimersByTime(2500);
    expect(spy).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(5000);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("writeJsonReport", () => {
  it("writes a parseable report and returns its path", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcst-rep-"));
    try {
      const snapshot = snapshotWithOneSpawn().snapshot;
      const path = writeJsonReport(dir, {
        finishedAt: new Date().toISOString(),
        target: { host: "h", port: 25565 },
        preflight: null,
        metrics: snapshot,
      });
      expect(path.startsWith(dir)).toBe(true);
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      expect(parsed.target).toEqual({ host: "h", port: 25565 });
      expect(parsed.metrics.spawned).toBe(1);
      expect(parsed.preflight).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
