import { describe, expect, it } from "vitest";
import type { PreflightResult } from "../src/net/slp.js";
import {
  matchKnownIssues,
  matchPluginAdvisories,
  type PluginAdvisory,
  queryOsv,
} from "../src/scan/advisories.js";
import { compareVersions, fingerprintServer } from "../src/scan/fingerprint.js";
import {
  applyVersions,
  inferFromChannels,
  inferFromCommands,
  mergeDetections,
  parsePluginVersions,
  pluginMavenCoordinate,
} from "../src/scan/plugins.js";
import { scan } from "../src/scan/scanner.js";
import { assembleFindings, buildScanReport, formatScanReport } from "../src/scan/scanReport.js";
import type { PluginDetection, ScanFinding } from "../src/scan/types.js";

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
  it("flags Log4Shell-era and outdated for an old bukkit-family version, with confidence", () => {
    const found = matchKnownIssues(fingerprintServer(pf("Paper 1.16.5")));
    expect(found.map((f) => f.id)).toContain("CVE-2021-44228");
    expect(found.map((f) => f.id)).toContain("MCST-OUTDATED");
    expect(found.every((f) => f.confidence === "high")).toBe(true);
  });
  it("does not flag Log4Shell for a non-affected loader, only outdated", () => {
    expect(matchKnownIssues(fingerprintServer(pf("Fabric 1.16"))).map((f) => f.id)).toEqual([
      "MCST-OUTDATED",
    ]);
  });
  it("clears a current version and ignores an unparseable one", () => {
    expect(matchKnownIssues(fingerprintServer(pf("Paper 1.20.1")))).toEqual([]);
    expect(matchKnownIssues(fingerprintServer(pf("Paper")))).toEqual([]);
  });
});

describe("plugin detection", () => {
  it("infers plugins from command namespaces (high) and known bare commands (medium)", () => {
    const d = inferFromCommands([
      "essentials:heal",
      "minecraft:tp",
      "paper:reload",
      "lp",
      "gamemode",
      "",
      "/",
    ]);
    expect(d).toContainEqual({ name: "essentials", source: "command", confidence: "high" });
    expect(d).toContainEqual({ name: "luckperms", source: "command", confidence: "medium" });
    expect(d.find((x) => x.name === "minecraft")).toBeUndefined();
  });

  it("infers plugins from plugin-message channels (high), aliasing known ones", () => {
    const d = inferFromChannels(["worldedit:cui", "floodgate:packet", "minecraft:register", "geyser:"]);
    expect(d.map((x) => x.name).sort()).toEqual(["floodgate", "geyser", "worldedit"]);
    expect(d.every((x) => x.confidence === "high" && x.source === "channel")).toBe(true);
  });

  it("merges detections, keeping the highest confidence and any version", () => {
    const merged = mergeDetections(
      [{ name: "worldedit", source: "command", confidence: "medium" }],
      [{ name: "worldedit", source: "channel", confidence: "high", version: "7.2.15" }],
      [{ name: "essentials", source: "command", confidence: "high" }],
    );
    expect(merged.find((d) => d.name === "worldedit")).toMatchObject({
      confidence: "high",
      version: "7.2.15",
    });
    expect(merged.map((d) => d.name)).toEqual(["essentials", "worldedit"]);
  });

  it("parses versions from /version-style chat and applies them", () => {
    const versions = parsePluginVersions([
      "EssentialsX version 2.20.1",
      "This server is running Paper",
      "LuckPerms v5.4.102",
    ]);
    expect(versions).toEqual({ essentialsx: "2.20.1", luckperms: "5.4.102" });
    const applied = applyVersions([{ name: "LuckPerms", source: "command", confidence: "high" }], versions);
    expect(applied[0]?.version).toBe("5.4.102");
  });

  it("maps known plugins to Maven coordinates for osv lookups", () => {
    expect(pluginMavenCoordinate("worldedit")).toBe("com.sk89q.worldedit:worldedit-core");
    expect(pluginMavenCoordinate("unknownplugin")).toBeUndefined();
  });

  it("handles bare/core channels, command confidence upgrades, and version edge cases", () => {
    expect(inferFromChannels(["mcmmo", "paper:tick", "spigot:x"]).map((d) => d.name)).toEqual(["mcmmo"]);
    // A bare-known command upgraded to high once the namespaced form appears.
    expect(inferFromCommands(["lp", "luckperms:info"])).toContainEqual({
      name: "luckperms",
      source: "command",
      confidence: "high",
    });
    // A lower-confidence detection does not override a higher one on merge or within a command list.
    const merged = mergeDetections(
      [{ name: "worldedit", source: "channel", confidence: "high" }],
      [{ name: "worldedit", source: "command", confidence: "medium" }],
    );
    expect(merged[0]).toMatchObject({ confidence: "high" });
    expect(inferFromCommands(["luckperms:x", "lp"]).find((d) => d.name === "luckperms")?.confidence).toBe(
      "high",
    );
    // A "version 3.0.0" line has no plugin name; applyVersions leaves unmatched detections alone.
    expect(parsePluginVersions(["version 3.0.0"])).toEqual({});
    expect(
      applyVersions([{ name: "x", source: "command", confidence: "low" }], { y: "1" })[0]?.version,
    ).toBeUndefined();
  });
});

describe("matchPluginAdvisories", () => {
  const rule: PluginAdvisory = {
    id: "TEST-1",
    plugin: "worldedit",
    title: "vulnerable WorldEdit",
    severity: "high",
    detail: "d",
    remediation: "update",
    affected: (v) => compareVersions(v, "7.2.0") < 0,
  };
  it("matches a curated version-range rule against a detected version", () => {
    const hits = matchPluginAdvisories(
      [{ name: "worldedit", source: "channel", confidence: "high", version: "7.1.0" }],
      [rule],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "TEST-1", confidence: "high" });
  });
  it("skips plugins without a version or outside the range", () => {
    expect(
      matchPluginAdvisories([{ name: "worldedit", source: "channel", confidence: "high" }], [rule]),
    ).toEqual([]);
    expect(
      matchPluginAdvisories(
        [{ name: "worldedit", source: "channel", confidence: "high", version: "7.3.0" }],
        [rule],
      ),
    ).toEqual([]);
  });
  it("ignores detections whose name does not match a rule", () => {
    expect(
      matchPluginAdvisories(
        [{ name: "other", source: "command", confidence: "high", version: "1.0" }],
        [rule],
      ),
    ).toEqual([]);
  });
  it("defaults to the shipped (currently empty) curated ruleset", () => {
    expect(
      matchPluginAdvisories([{ name: "x", source: "command", confidence: "high", version: "1.0" }]),
    ).toEqual([]);
  });
});

describe("queryOsv", () => {
  const fetchWith = (body: unknown, ok = true): typeof fetch =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
  it("maps vulns to findings with severity from CVSS and high confidence", async () => {
    const out = await queryOsv(
      "com.example:lib",
      "1.0.0",
      fetchWith({
        vulns: [
          { id: "GHSA-1", summary: "bad", severity: [{ type: "CVSS_V3", score: "9.8" }] },
          { id: "G2" },
        ],
      }),
    );
    expect(out.map((f) => f.severity)).toEqual(["critical", "medium"]);
    expect(out.every((f) => f.source === "osv.dev" && f.confidence === "high")).toBe(true);
  });
  it("maps high and low CVSS bands", async () => {
    const out = await queryOsv(
      "x",
      "1",
      fetchWith({
        vulns: [
          { id: "H", severity: [{ type: "C", score: "7.5" }] },
          { id: "L", severity: [{ type: "C", score: "2.0" }] },
        ],
      }),
    );
    expect(out.map((f) => f.severity)).toEqual(["high", "low"]);
  });
  it("returns nothing on a non-ok response, a body with no vulns, or a thrown fetch", async () => {
    expect(await queryOsv("x", "1", fetchWith({}, false))).toEqual([]);
    expect(await queryOsv("x", "1", fetchWith({}))).toEqual([]); // ok but no vulns array
    const boom = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await queryOsv("x", "1", boom)).toEqual([]);
  });

  it("falls back to defaults when a vuln omits id/summary/details", async () => {
    const [out] = await queryOsv("com.x:y", "2.0", fetchWith({ vulns: [{}] }));
    expect(out).toMatchObject({ id: "OSV-UNKNOWN", severity: "medium" });
    expect(out?.title).toContain("com.x:y");
    expect(out?.detail).toContain("com.x:y@2.0");
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
  const det: PluginDetection[] = [
    { name: "worldedit", version: "7.1.0", source: "channel", confidence: "high" },
  ];
  it("assembles a report and renders findings + plugin detections", () => {
    const report = buildScanReport({
      target: { host: "h", port: 25565 },
      fingerprint: fp,
      plugins: det,
      findings: matchKnownIssues(fp),
      scannedAt: "t",
    });
    const text = formatScanReport(report);
    expect(text).toContain("[CRITICAL]");
    expect(text).toContain("worldedit@7.1.0 (high)");
    expect(text).toContain("high confidence");
  });
  it("says so when nothing matched and renders unknowns", () => {
    const report = buildScanReport({
      target: { host: "h", port: 1 },
      fingerprint: fingerprintServer(pf("")),
      plugins: [],
      findings: [],
    });
    const text = formatScanReport(report);
    expect(text).toMatch(/No known issues/);
    expect(text).toContain("version: unknown");
    expect(text).toContain("none detected");
  });

  it("renders a version-less plugin and a confidence-less finding", () => {
    const report = buildScanReport({
      target: { host: "h", port: 1 },
      fingerprint: fp,
      plugins: [{ name: "coreprotect", source: "command", confidence: "medium" }],
      findings: [{ id: "X", title: "t", severity: "low", detail: "d", remediation: "r", source: "advisory" }],
    });
    const text = formatScanReport(report);
    expect(text).toContain("coreprotect (medium)");
    expect(text).not.toContain("coreprotect@");
    expect(text).toContain("(X, advisory)"); // no ", confidence" suffix
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
          return { commands: [], channels: [] };
        },
      },
    );
    expect(reconCalled).toBe(false);
    expect(report.fingerprint.software).toBe("paper");
    expect(report.findings.map((f) => f.id)).toContain("CVE-2021-44228");
    expect(report.plugins).toEqual([]);
  });

  it("infers plugins from channels + commands and queries osv for versioned, known plugins", async () => {
    const osvCalls: Array<[string, string]> = [];
    const report = await scan(
      target,
      { deep: true, probeVersions: true, spec: { id: 0 } as never, scannedAt: "t" },
      {
        preflight,
        recon: async (_spec, o) => ({
          commands: ["essentials:heal", "worldedit:/wand", "coreprotect:co"],
          channels: ["worldedit:cui"],
          // coreprotect has a version but no known Maven coordinate, so osv must be skipped for it.
          versionLines: o.probeVersions ? ["WorldEdit version 7.1.0", "CoreProtect version 21.3"] : [],
        }),
        osv: async (pkg, version) => {
          osvCalls.push([pkg, version]);
          return [
            {
              id: "OSV-X",
              title: "bad",
              severity: "high",
              detail: "",
              remediation: "",
              source: "osv.dev",
              confidence: "high",
            },
          ];
        },
      },
    );
    expect(report.plugins.map((p) => p.name).sort()).toEqual(["coreprotect", "essentials", "worldedit"]);
    expect(report.plugins.find((p) => p.name === "worldedit")?.version).toBe("7.1.0");
    expect(report.plugins.find((p) => p.name === "coreprotect")?.version).toBe("21.3");
    // osv queried only for worldedit (has a version + a known Maven coordinate), not essentials (no version).
    expect(osvCalls).toEqual([["com.sk89q.worldedit:worldedit-core", "7.1.0"]]);
    expect(report.findings.map((f) => f.id)).toContain("OSV-X");
  });

  it("deep without versions skips osv (no version to match)", async () => {
    let osvCalled = false;
    const report = await scan(
      target,
      { deep: true, spec: { id: 0 } as never, scannedAt: "t" },
      {
        preflight,
        recon: async () => ({ commands: ["worldedit:/wand"], channels: [] }),
        osv: async () => {
          osvCalled = true;
          return [];
        },
      },
    );
    expect(osvCalled).toBe(false);
    expect(report.plugins.map((p) => p.name)).toEqual(["worldedit"]);
    expect(report.plugins[0]?.version).toBeUndefined();
  });

  it("tolerates a recon result with no channels field", async () => {
    const report = await scan(
      target,
      { deep: true, spec: { id: 0 } as never, scannedAt: "t" },
      { preflight, recon: async () => ({ commands: ["essentials:heal"] }) as never, osv: async () => [] },
    );
    expect(report.plugins.map((p) => p.name)).toEqual(["essentials"]);
  });
});
