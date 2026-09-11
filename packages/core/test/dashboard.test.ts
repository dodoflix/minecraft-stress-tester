import { describe, expect, it } from "vitest";
import type { MetricsSnapshot } from "../src/metrics/collector.js";
import { bar, renderDashboard } from "../src/report/dashboard.js";

const emptyH = { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
function snap(over: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    elapsedMs: 5000,
    attempted: 10,
    connected: 10,
    loggedIn: 10,
    spawned: 8,
    active: 8,
    ended: 0,
    kicked: 1,
    errors: 0,
    connectSuccessRate: 0.8,
    packetsIn: 100,
    bytesIn: 2048,
    packetsPerSec: 20,
    bytesPerSec: 512,
    tps: 19.5,
    timeToConnectMs: { ...emptyH, p95: 40 },
    timeToSpawnMs: { ...emptyH, p95: 80 },
    serverPingMs: emptyH,
    kickReasons: { antibot: 1 },
    ...over,
  };
}

describe("bar", () => {
  it("fills proportionally and stays fixed width", () => {
    expect(bar(0, 20, 10)).toBe("[----------]");
    expect(bar(20, 20, 10)).toBe("[##########]");
    expect(bar(10, 20, 10)).toBe("[#####-----]");
  });
  it("clamps out-of-range and handles max<=0", () => {
    expect(bar(30, 20, 10)).toBe("[##########]");
    expect(bar(5, 0, 10)).toBe("[----------]");
  });
});

describe("renderDashboard", () => {
  it("shows target, progress, TPS, and kick reasons", () => {
    const out = renderDashboard(snap(), { target: "h:25565", version: "1.21", count: 10 });
    expect(out).toContain("h:25565");
    expect(out).toContain("8/10 (80%)");
    expect(out).toContain("19.5/20");
    expect(out).toContain("1 x antibot");
  });
  it("renders ping as n/a when no samples", () => {
    const out = renderDashboard(snap(), { target: "h", version: "auto", count: 10 });
    expect(out).toContain("server ping");
    expect(out).toContain("n/a");
  });
  it("renders ping percentiles when present", () => {
    const out = renderDashboard(snap({ serverPingMs: { ...emptyH, count: 3, p50: 12, p95: 40 } }), {
      target: "h",
      version: "auto",
      count: 10,
    });
    expect(out).toContain("12 ms");
    expect(out).toContain("40 ms");
  });

  it("formats throughput in B, KB, and MB", () => {
    const ctx = { target: "h", version: "auto", count: 10 };
    expect(renderDashboard(snap({ bytesPerSec: 500 }), ctx)).toContain("500 B/s");
    expect(renderDashboard(snap({ bytesPerSec: 5000 }), ctx)).toContain("KB/s");
    expect(renderDashboard(snap({ bytesPerSec: 5_000_000 }), ctx)).toContain("MB/s");
  });
});
