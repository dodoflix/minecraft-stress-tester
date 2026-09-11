import { describe, expect, it } from "vitest";
import type { PreflightResult } from "../src/net/slp.js";
import { matchKnownIssues, queryOsv } from "../src/scan/advisories.js";
import { compareVersions, fingerprintServer } from "../src/scan/fingerprint.js";
import { inferPlugins } from "../src/scan/plugins.js";
import { scan } from "../src/scan/scanner.js";
import { assembleFindings, buildScanReport, formatScanReport } from "../src/scan/scanReport.js";
import type { ScanFinding } from "../src/scan/types.js";

const pf = (versionName: string, protocol = 765): PreflightResult => ({
  motd: "test",
  versionName,
  protocol,
  online: 0,
  max: 20,
  latencyMs: 1,
});

describe("fingerprintServer", () => {
  it("extracts software and version, preferring specific names", () => {
    expect(fingerprintServer(pf("Paper 1.20.1"))).toMatchObject({ software: "paper", version: "1.20.1" });
    expect(fingerprintServer(pf("CraftBukkit 1.8.8")).software).toBe("craftbukkit");
  });
  it("falls back to unknown/null", () => {
    expect(fingerprintServer(pf("1.20.1"))).toMatchObject({ software: "unknown", version: "1.20.1" });
    expect(fingerprintServer(pf(""))).toMatchObject({ software: "unknown", version: null });
  });
});

describe("compareVersions", () => {
  it("orders dotted versions numerically", () => {
    expect(compareVersions("1.18.1", "1.18.1")).toBe(0);
    expect(compareVersions("1.7", "1.18.1")).toBeLessThan(0);
    expect(compareVersions("1.20.1", "1.20")).toBeGreaterThan(0);
    expect(compareVersions("1.20", "1.20.1")).toBeLessThan(0);
  });
});

describe("matchKnownIssues", () => {
  it("flags Log4Shell-era and outdated for an old bukkit-family version", () => {
    const ids = matchKnownIssues(fingerprintServer(pf("Paper 1.16.5"))).map((f) => f.id);
    expect(ids).toContain("CVE-2021-44228");
    expect(ids).toContain("MCST-OUTDATED");
  });
  it("does not flag Log4Shell for a non-affected loader, only outdated", () => {
    const ids = matchKnownIssues(fingerprintServer(pf("Fabric 1.16"))).map((f) => f.id);
    expect(ids).toEqual(["MCST-OUTDATED"]);
  });
  it("clears a current version", () => {
    expect(matchKnownIssues(fingerprintServer(pf("Paper 1.20.1")))).toEqual([]);
  });
  it("only flags outdated between the Log4Shell fix and the min supported version", () => {
    const ids = matchKnownIssues(fingerprintServer(pf("Paper 1.19"))).map((f) => f.id);
    expect(ids).toEqual(["MCST-OUTDATED"]);
  });
  it("ignores an unparseable version", () => {
    expect(matchKnownIssues(fingerprintServer(pf("Paper")))).toEqual([]);
  });
});

describe("queryOsv", () => {
  const fetchWith = (body: unknown, ok = true): typeof fetch =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("maps vulns to findings with a severity derived from CVSS", async () => {
    const fetchImpl = fetchWith({
      vulns: [
        { id: "GHSA-1", summary: "bad", severity: [{ type: "CVSS_V3", score: "9.8" }] },
        { id: "GHSA-2", severity: [{ type: "CVSS_V3", score: "5.0" }] },
        { id: "GHSA-3" },
      ],
    });
    const out = await queryOsv("com.example:lib", "1.0.0", fetchImpl);
    expect(out.map((f) => f.severity)).toEqual(["critical", "medium", "medium"]);
    expect(out[0]?.source).toBe("osv.dev");
  });
  it("maps high and low CVSS bands", async () => {
    const fetchImpl = fetchWith({
      vulns: [
        { id: "H", severity: [{ type: "CVSS_V3", score: "7.5" }] },
        { id: "L", severity: [{ type: "CVSS_V3", score: "2.0" }] },
      ],
    });
    expect((await queryOsv("x", "1", fetchImpl)).map((f) => f.severity)).toEqual(["high", "low"]);
  });
  it("returns nothing on a non-ok response or a thrown fetch", async () => {
    expect(await queryOsv("x", "1", fetchWith({}, false))).toEqual([]);
    const boom = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await queryOsv("x", "1", boom)).toEqual([]);
  });
});

describe("inferPlugins", () => {
  it("derives plugins from command namespaces and known bare commands", () => {
    expect(
      inferPlugins([
        "essentials:heal",
        "luckperms:lp",
        "minecraft:tp",
        "paper:reload",
        "lp",
        "co",
        "gamemode",
        "worldedit:/wand",
        "",
        "/",
      ]),
    ).toEqual(["coreprotect", "essentials", "luckperms", "worldedit"]);
  });
});

describe("assembleFindings", () => {
  const f = (id: string, severity: ScanFinding["severity"]): ScanFinding => ({
    id,
    severity,
    title: id,
    detail: "",
    remediation: "",
    source: "advisory",
  });
  it("dedupes by id (first wins) and sorts most-severe first", () => {
    const out = assembleFindings([f("a", "medium"), f("b", "critical")], [f("a", "low")]);
    expect(out.map((x) => `${x.id}:${x.severity}`)).toEqual(["b:critical", "a:medium"]);
  });
});

describe("buildScanReport / formatScanReport", () => {
  const fp = fingerprintServer(pf("Paper 1.16.5"));
  it("assembles a report and renders findings", () => {
    const report = buildScanReport({
      target: { host: "h", port: 25565 },
      fingerprint: fp,
      plugins: ["essentials"],
      findings: matchKnownIssues(fp),
      scannedAt: "2026-09-11T00:00:00.000Z",
    });
    const text = formatScanReport(report);
    expect(text).toContain("[CRITICAL]");
    expect(text).toContain("essentials");
  });
  it("says so when nothing matched, and renders an unknown version", () => {
    const clean = fingerprintServer(pf(""));
    const report = buildScanReport({
      target: { host: "h", port: 1 },
      fingerprint: clean,
      plugins: [],
      findings: [],
    });
    const text = formatScanReport(report);
    expect(text).toMatch(/No known issues/);
    expect(text).toContain("version: unknown");
    expect(text).toContain("none detected");
  });
});

describe("scan", () => {
  const target = { host: "localhost", port: 25565 };
  const preflight = async () => pf("Paper 1.16.5", 754);

  it("scans SLP-only by default and skips recon", async () => {
    let reconCalled = false;
    const report = await scan(
      target,
      { deep: false, scannedAt: "t" },
      {
        preflight,
        recon: async () => {
          reconCalled = true;
          return { commands: [] };
        },
      },
    );
    expect(reconCalled).toBe(false);
    expect(report.fingerprint.software).toBe("paper");
    expect(report.findings.map((f) => f.id)).toContain("CVE-2021-44228");
    expect(report.plugins).toEqual([]);
  });

  it("runs recon and infers plugins in deep mode", async () => {
    const spec = { id: 0 } as never;
    const report = await scan(
      target,
      { deep: true, spec, scannedAt: "t" },
      { preflight, recon: async () => ({ commands: ["essentials:heal", "luckperms:lp"] }) },
    );
    expect(report.plugins).toEqual(["essentials", "luckperms"]);
  });
});
