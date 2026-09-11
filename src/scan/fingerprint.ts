import type { PreflightResult } from "../net/slp.js";

export interface Fingerprint {
  /** Detected server software, lowercased (paper/spigot/vanilla/...), or "unknown". */
  software: string;
  /** Detected Minecraft version (e.g. "1.20.1"), or null if not parseable. */
  version: string | null;
  protocol: number;
  /** The raw SLP version string, kept for the report. */
  raw: string;
}

// Longest/most-specific names first so "craftbukkit" wins over "bukkit", etc.
const SOFTWARE = [
  "purpur",
  "paper",
  "folia",
  "craftbukkit",
  "spigot",
  "bukkit",
  "fabric",
  "forge",
  "velocity",
  "waterfall",
  "bungeecord",
  "vanilla",
];

/** Best-effort fingerprint from the SLP handshake alone (no join required). Pure. */
export function fingerprintServer(preflight: Pick<PreflightResult, "versionName" | "protocol">): Fingerprint {
  const raw = preflight.versionName ?? "";
  const lower = raw.toLowerCase();
  const software = SOFTWARE.find((s) => lower.includes(s)) ?? "unknown";
  const version = raw.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? null;
  return { software, version, protocol: preflight.protocol, raw };
}

/** Compare dotted versions numerically. Returns <0, 0, >0. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
