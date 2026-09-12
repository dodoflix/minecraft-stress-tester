export type Severity = "info" | "low" | "medium" | "high" | "critical";

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** How sure a detection/finding is: a namespaced command or plugin channel is strong evidence,
 *  a bare command guess is weaker, a heuristic weaker still. Reported so operators can triage. */
export type Confidence = "high" | "medium" | "low";

export interface ScanFinding {
  id: string;
  title: string;
  severity: Severity;
  detail: string;
  remediation: string;
  /** Where the finding came from: "advisory", "osv.dev", "recon", ... */
  source: string;
  /** How confident the match is. Absent = treat as high (curated/version-derived). */
  confidence?: Confidence;
}

/** A detected plugin: its name, an optional best-effort version, how it was seen, and confidence. */
export interface PluginDetection {
  name: string;
  version?: string;
  /** "command" | "channel" | "brand". */
  source: string;
  confidence: Confidence;
}
