import { compareVersions, type Fingerprint } from "./fingerprint.js";
import type { ScanFinding, Severity } from "./types.js";

interface Advisory {
  id: string;
  title: string;
  severity: Severity;
  detail: string;
  remediation: string;
  applies: (fp: Fingerprint) => boolean;
}

const BUKKIT_FAMILY = ["paper", "purpur", "spigot", "craftbukkit", "bukkit", "folia"];

// Minimum Minecraft version considered current for the "outdated" check. This is the one
// knob that drifts over time; bump it as new versions ship (it is deliberately a single,
// named constant rather than an inferred "latest").
const MIN_SUPPORTED_VERSION = "1.20";

/**
 * Curated, version-range advisories a client can evaluate from the fingerprint alone. Kept
 * small and honest: each is a heuristic ("verify your build"), not a confirmed exploit.
 */
const ADVISORIES: Advisory[] = [
  {
    id: "CVE-2021-44228",
    title: "Log4Shell-era version (verify the build is patched)",
    severity: "critical",
    detail:
      "The reported Minecraft version predates the Log4Shell (CVE-2021-44228) fixes. If the " +
      "server jar was not hotpatched, remote code execution via crafted log messages is possible.",
    remediation:
      "Update to a build released after December 2021, or launch with " +
      "-Dlog4j2.formatMsgNoLookups=true and confirm your log4j version is patched.",
    applies: (fp) =>
      fp.version !== null &&
      (fp.software === "vanilla" || fp.software === "forge" || BUKKIT_FAMILY.includes(fp.software)) &&
      compareVersions(fp.version, "1.7") >= 0 &&
      compareVersions(fp.version, "1.18.1") < 0,
  },
  {
    id: "MCST-OUTDATED",
    title: "Outdated server version",
    severity: "medium",
    detail: `The detected version is older than ${MIN_SUPPORTED_VERSION}, so it is missing later security and stability fixes.`,
    remediation: `Update the server to ${MIN_SUPPORTED_VERSION} or newer.`,
    applies: (fp) => fp.version !== null && compareVersions(fp.version, MIN_SUPPORTED_VERSION) < 0,
  },
];

/** Evaluate the curated advisories against a fingerprint. Pure. */
export function matchKnownIssues(fp: Fingerprint): ScanFinding[] {
  return ADVISORIES.filter((a) => a.applies(fp)).map((a) => ({
    id: a.id,
    title: a.title,
    severity: a.severity,
    detail: a.detail,
    remediation: a.remediation,
    source: "advisory",
  }));
}

interface OsvVuln {
  id?: string;
  summary?: string;
  details?: string;
  severity?: { type: string; score: string }[];
}

/** Map an OSV severity block to our scale (best-effort; OSV uses CVSS vectors). */
function osvSeverity(v: OsvVuln): Severity {
  const score = v.severity?.[0]?.score ?? "";
  const cvss = Number(score.match(/\d+(\.\d+)?/)?.[0]);
  if (Number.isNaN(cvss)) return "medium";
  if (cvss >= 9) return "critical";
  if (cvss >= 7) return "high";
  if (cvss >= 4) return "medium";
  return "low";
}

/**
 * Query osv.dev for known vulnerabilities of a Maven package at a version. Best-effort: most
 * Minecraft plugins are not published to Maven, so this usually returns nothing. Pure aside
 * from the injected fetch, so it is unit-tested with a fake.
 */
export async function queryOsv(
  pkg: string,
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScanFinding[]> {
  let vulns: OsvVuln[] = [];
  try {
    const res = await fetchImpl("https://api.osv.dev/v1/query", {
      method: "POST",
      body: JSON.stringify({ version, package: { ecosystem: "Maven", name: pkg } }),
    });
    if (!res.ok) return [];
    vulns = ((await res.json()) as { vulns?: OsvVuln[] }).vulns ?? [];
  } catch {
    return []; // osv.dev unreachable: report nothing rather than fail the scan
  }
  return vulns.map((v) => ({
    id: v.id ?? "OSV-UNKNOWN",
    title: v.summary ?? `Known vulnerability in ${pkg}`,
    severity: osvSeverity(v),
    detail: v.details ?? `${pkg}@${version} is affected by ${v.id ?? "a known advisory"}.`,
    remediation: "Update the affected plugin/library to a fixed version.",
    source: "osv.dev",
  }));
}
