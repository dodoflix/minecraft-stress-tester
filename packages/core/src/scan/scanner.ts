import type { BotSpec } from "../drivers/driver.js";
import { type PreflightResult, preflight as realPreflight } from "../net/slp.js";
import { matchKnownIssues, matchPluginAdvisories, queryOsv } from "./advisories.js";
import { fingerprintServer } from "./fingerprint.js";
import {
  applyVersions,
  inferFromChannels,
  inferFromCommands,
  mergeDetections,
  parsePluginVersions,
  pluginMavenCoordinate,
} from "./plugins.js";
import { type ReconResult, deepRecon as realRecon } from "./recon.js";
import { buildScanReport, type ScanReport } from "./scanReport.js";
import type { ScanFinding } from "./types.js";

export interface ScanDeps {
  preflight?: (host: string, port: number, version?: string) => Promise<PreflightResult>;
  recon?: (spec: BotSpec, opts: { probeVersions: boolean }) => Promise<ReconResult>;
  /** osv.dev lookup for a Maven package + version. Injectable for tests / offline runs. */
  osv?: (pkg: string, version: string) => Promise<ScanFinding[]>;
}

export interface ScanOptions {
  /** Join one bot to fingerprint plugins (brand + plugin channels + command tab-complete). */
  deep?: boolean;
  /** Also send read-only `/version` commands to best-effort detect plugin versions (deep only). */
  probeVersions?: boolean;
  spec?: BotSpec;
  scannedAt?: string;
}

/**
 * Best-effort, defensive scan: SLP fingerprint + curated version advisories, and (with `deep`)
 * plugin detection from a joined bot's plugin channels and command tab-complete, plus optional
 * best-effort version probing that unlocks curated plugin advisories and live osv.dev CVE matching.
 * Non-destructive and confidence-labeled. All I/O is injectable, so the orchestration is unit-tested.
 */
export async function scan(
  target: { host: string; port: number; version?: string },
  opts: ScanOptions = {},
  deps: ScanDeps = {},
): Promise<ScanReport> {
  const preflight = deps.preflight ?? realPreflight;
  const pf = await preflight(target.host, target.port, target.version);
  const fingerprint = fingerprintServer(pf);
  const findings = matchKnownIssues(fingerprint);
  let plugins = [] as ReturnType<typeof mergeDetections>;

  if (opts.deep && opts.spec) {
    const recon = deps.recon ?? realRecon;
    const result = await recon(opts.spec, { probeVersions: Boolean(opts.probeVersions) });
    plugins = mergeDetections(inferFromChannels(result.channels ?? []), inferFromCommands(result.commands));
    if (result.versionLines?.length) {
      plugins = applyVersions(plugins, parsePluginVersions(result.versionLines));
    }
    findings.push(...matchPluginAdvisories(plugins));
    // Live CVE matching for plugins we have a version and a Maven coordinate for.
    const osv = deps.osv ?? queryOsv;
    for (const p of plugins) {
      const coord = p.version && pluginMavenCoordinate(p.name);
      if (coord && p.version) findings.push(...(await osv(coord, p.version)));
    }
  }

  return buildScanReport({
    target: { host: target.host, port: target.port },
    fingerprint,
    plugins,
    findings,
    scannedAt: opts.scannedAt,
  });
}
