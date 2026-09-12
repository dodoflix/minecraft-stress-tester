export type Severity = "info" | "low" | "medium" | "high" | "critical";

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface ScanFinding {
  id: string;
  title: string;
  severity: Severity;
  detail: string;
  remediation: string;
  /** Where the finding came from: "advisory", "osv.dev", "recon", ... */
  source: string;
}
