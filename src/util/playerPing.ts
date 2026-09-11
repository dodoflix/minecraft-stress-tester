/**
 * Pull this bot's server-perceived ping out of a player_info / player_info_update packet.
 * Shapes differ across versions (pre-1.19.3 `{data:[{name,ping}]}`, 1.19.3+
 * `{data:[{player:{name},latency}]}`), so read both. Returns undefined when absent.
 */
export function extractOwnPing(data: unknown, username: string): number | undefined {
  const entries = (data as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(entries)) return undefined;
  for (const e of entries) {
    const entry = e as { name?: string; player?: { name?: string }; ping?: number; latency?: number };
    const name = entry.name ?? entry.player?.name;
    const ping = entry.ping ?? entry.latency;
    if (name === username && typeof ping === "number" && ping >= 0) return ping;
  }
  return undefined;
}
