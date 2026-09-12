import type { Confidence, PluginDetection } from "./types.js";

// Namespaces that belong to the server/vanilla itself, not a plugin.
const CORE_NAMESPACES = new Set(["minecraft", "bukkit", "spigot", "paper", "purpur"]);

// A few well-known bare commands that give a plugin away when it isn't namespaced.
const KNOWN_COMMANDS: Record<string, string> = {
  lp: "luckperms",
  co: "coreprotect",
  we: "worldedit",
  wg: "worldguard",
  ess: "essentialsx",
  essentials: "essentialsx",
  pl: "bukkit-plugin-list",
  plugins: "bukkit-plugin-list",
  ver: "bukkit-version",
  version: "bukkit-version",
};

// Plugin-message channel namespaces that identify a plugin. The namespace before ":" is the
// registrant; a small map normalizes well-known ones to their common plugin name.
const CHANNEL_ALIASES: Record<string, string> = {
  worldedit: "worldedit",
  we: "worldedit",
  wecui: "worldedit",
  floodgate: "floodgate",
  geyser: "geyser",
  viaversion: "viaversion",
  libsdisguises: "libsdisguises",
  bungeecord: "bungeecord",
  velocity: "velocity",
  fabric: "fabric",
};

// Best-effort Maven coordinates for plugins we can meaningfully query osv.dev about. Only plugins
// with a real published artifact are listed; others skip the osv lookup rather than guess.
export const PLUGIN_MAVEN: Record<string, string> = {
  worldedit: "com.sk89q.worldedit:worldedit-core",
  worldguard: "com.sk89q.worldguard:worldguard-core",
  essentialsx: "net.essentialsx:EssentialsX",
  luckperms: "net.luckperms:api",
};

/** The Maven coordinate to query osv.dev for a detected plugin, or undefined if unknown. */
export function pluginMavenCoordinate(name: string): string | undefined {
  return PLUGIN_MAVEN[name.toLowerCase()];
}

function normalizeNamespace(ns: string): string {
  return CHANNEL_ALIASES[ns] ?? ns;
}

/** Plugins inferred from registered plugin-message channels (strong evidence: only a loaded
 *  plugin registers a channel). Pure. */
export function inferFromChannels(channels: string[]): PluginDetection[] {
  const found = new Map<string, PluginDetection>();
  for (const raw of channels) {
    const ch = raw.toLowerCase().trim();
    const ns = ch.includes(":") ? ch.slice(0, ch.indexOf(":")) : ch;
    if (!ns || CORE_NAMESPACES.has(ns)) continue;
    const name = normalizeNamespace(ns);
    if (!found.has(name)) found.set(name, { name, source: "channel", confidence: "high" });
  }
  return [...found.values()];
}

/** Plugins inferred from a tab-completed command list. Namespaced commands are strong evidence;
 *  a bare command matched against the known-command map is a weaker guess. Pure. */
export function inferFromCommands(commands: string[]): PluginDetection[] {
  const found = new Map<string, PluginDetection>();
  const add = (name: string, confidence: Confidence) => {
    const prev = found.get(name);
    if (!prev || rank(confidence) > rank(prev.confidence))
      found.set(name, { name, source: "command", confidence });
  };
  for (const raw of commands) {
    const cmd = raw.replace(/^\//, "").toLowerCase().trim();
    if (!cmd) continue;
    const colon = cmd.indexOf(":");
    if (colon > 0) {
      const ns = cmd.slice(0, colon);
      if (!CORE_NAMESPACES.has(ns)) add(ns, "high");
      continue;
    }
    const known = KNOWN_COMMANDS[cmd];
    if (known) add(known, "medium");
  }
  return [...found.values()];
}

function rank(c: Confidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}

/** Merge detection lists, deduping by name: keep the highest confidence and any known version. */
export function mergeDetections(...lists: PluginDetection[][]): PluginDetection[] {
  const byName = new Map<string, PluginDetection>();
  for (const list of lists) {
    for (const d of list) {
      const prev = byName.get(d.name);
      if (!prev) {
        byName.set(d.name, { ...d });
        continue;
      }
      if (rank(d.confidence) > rank(prev.confidence)) {
        prev.confidence = d.confidence;
        prev.source = d.source;
      }
      if (!prev.version && d.version) prev.version = d.version;
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// "EssentialsX version 2.20.1", "Version: WorldEdit 7.2.15", "LuckPerms v5.4.102".
const VERSION_LINE = /([A-Za-z][\w-]{2,})\s+(?:version\s+|v)(\d+\.\d+(?:\.\d+)?)/i;

/** Extract plugin -> version from `/version <plugin>`-style chat replies. Best-effort, pure. */
export function parsePluginVersions(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(VERSION_LINE);
    if (m?.[1] && m[2]) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

/** Attach detected versions (by case-insensitive name match) to detections. Pure. */
export function applyVersions(
  detections: PluginDetection[],
  versions: Record<string, string>,
): PluginDetection[] {
  return detections.map((d) => {
    const v = versions[d.name.toLowerCase()];
    return v ? { ...d, version: v } : d;
  });
}
