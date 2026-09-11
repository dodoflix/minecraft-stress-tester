import type { BotSpec } from "../drivers/driver.js";
import { type PreflightResult, preflight as realPreflight } from "../net/slp.js";
import { matchKnownIssues } from "./advisories.js";
import { fingerprintServer } from "./fingerprint.js";
import { inferPlugins } from "./plugins.js";
import { type ReconResult, deepRecon as realRecon } from "./recon.js";
import { buildScanReport, type ScanReport } from "./scanReport.js";

export interface ScanDeps {
  preflight?: (host: string, port: number, version?: string) => Promise<PreflightResult>;
  recon?: (spec: BotSpec) => Promise<ReconResult>;
}

export interface ScanOptions {
  /** Join one bot to fingerprint plugins via brand + command tab-complete. */
  deep?: boolean;
  spec?: BotSpec;
  scannedAt?: string;
}

/**
 * Run a best-effort, defensive scan: SLP fingerprint + curated version advisories, and (with
 * `deep`) plugin inference from a joined bot's tab-complete. All I/O is injectable, so the
 * orchestration is unit-tested; the real preflight and recon do the network work.
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

  let plugins: string[] = [];
  if (opts.deep && opts.spec) {
    const recon = deps.recon ?? realRecon;
    const result = await recon(opts.spec);
    plugins = inferPlugins(result.commands);
  }

  return buildScanReport({
    target: { host: target.host, port: target.port },
    fingerprint,
    plugins,
    findings,
    scannedAt: opts.scannedAt,
  });
}
