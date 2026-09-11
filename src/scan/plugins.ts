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

/**
 * Infer likely plugins from a tab-completed command list. Server plugins register commands as
 * `namespace:command`, so the namespace names the plugin; a small map covers well-known bare
 * commands. Best-effort: obfuscated/hidden commands will be missed. Pure.
 */
export function inferPlugins(commands: string[]): string[] {
  const found = new Set<string>();
  for (const raw of commands) {
    const cmd = raw.replace(/^\//, "").toLowerCase().trim();
    if (!cmd) continue;
    const colon = cmd.indexOf(":");
    if (colon > 0) {
      const ns = cmd.slice(0, colon);
      if (!CORE_NAMESPACES.has(ns)) found.add(ns);
      continue;
    }
    const known = KNOWN_COMMANDS[cmd];
    if (known) found.add(known);
  }
  return [...found].sort();
}
