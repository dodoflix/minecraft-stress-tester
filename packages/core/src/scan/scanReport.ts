import type { Fingerprint } from "./fingerprint.js";
import { type PluginDetection, type ScanFinding, SEVERITY_ORDER } from "./types.js";

export interface ScanReport {
  target: { host: string; port: number };
  scannedAt: string;
  fingerprint: Fingerprint;
  plugins: PluginDetection[];
  findings: ScanFinding[];
}

/** Flatten finding groups, drop duplicate ids (first wins), sort most-severe first. Pure. */
export function assembleFindings(...groups: ScanFinding[][]): ScanFinding[] {
  const byId = new Map<string, ScanFinding>();
  for (const group of groups) {
    for (const f of group) if (!byId.has(f.id)) byId.set(f.id, f);
  }
  return [...byId.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function buildScanReport(input: {
  target: { host: string; port: number };
  fingerprint: Fingerprint;
  plugins: PluginDetection[];
  findings: ScanFinding[];
  scannedAt?: string;
}): ScanReport {
  return {
    target: input.target,
    scannedAt: input.scannedAt ?? new Date().toISOString(),
    fingerprint: input.fingerprint,
    plugins: input.plugins,
    findings: assembleFindings(input.findings),
  };
}

/** Human-readable console report. Pure. */
export function formatScanReport(report: ScanReport): string {
  const fp = report.fingerprint;
  const plugins = report.plugins.length
    ? report.plugins.map((p) => `${p.name}${p.version ? `@${p.version}` : ""} (${p.confidence})`).join(", ")
    : "none detected";
  const lines = [
    `=== Security scan: ${report.target.host}:${report.target.port} ===`,
    `software: ${fp.software}   version: ${fp.version ?? "unknown"}   protocol: ${fp.protocol}`,
    `plugins:  ${plugins}`,
    "",
  ];
  if (!report.findings.length) {
    lines.push("No known issues matched. This is best-effort detection, not a guarantee.");
    return lines.join("\n");
  }
  lines.push(`${report.findings.length} finding(s):`);
  for (const f of report.findings) {
    const conf = f.confidence ? `, ${f.confidence} confidence` : "";
    lines.push(
      "",
      `[${f.severity.toUpperCase()}] ${f.title} (${f.id}, ${f.source}${conf})`,
      `  ${f.detail}`,
      `  fix: ${f.remediation}`,
    );
  }
  return lines.join("\n");
}
