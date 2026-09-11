import mc from "minecraft-protocol";

export interface PreflightResult {
  motd: string;
  versionName: string;
  protocol: number;
  online: number;
  max: number;
  latencyMs: number;
}

/** The loosely-typed status-ping payload minecraft-protocol returns. */
interface RawPing {
  description?: unknown;
  version?: { name?: string; protocol?: number };
  players?: { online?: number; max?: number };
  latency?: number;
}

/** Server-list-ping the target before any load: proves reachability and reports version/players/RTT. */
export async function preflight(host: string, port: number, version?: string): Promise<PreflightResult> {
  const res = await new Promise<unknown>((resolve, reject) => {
    const options = { host, port, version: version ?? false };
    mc.ping(
      options as unknown as Parameters<typeof mc.ping>[0],
      (err: NodeJS.ErrnoException | null, result) => {
        if (err) reject(new Error(`cannot reach ${host}:${port} — ${err.code || err.message}`));
        else resolve(result);
      },
    );
  });
  return parsePing(res);
}

/** Pure parse of a raw status-ping response into our normalized shape. Unit-tested. */
export function parsePing(res: unknown): PreflightResult {
  const r = (res ?? {}) as RawPing;
  const desc = r.description;
  const motd = typeof desc === "string" ? desc : extractText(desc);
  return {
    motd: String(motd)
      .replace(/§[0-9a-fk-or]/gi, "")
      .trim(),
    versionName: r.version?.name ?? "unknown",
    protocol: Number(r.version?.protocol ?? 0),
    online: Number(r.players?.online ?? 0),
    max: Number(r.players?.max ?? 0),
    latencyMs: Number(r.latency ?? 0),
  };
}

/** Flatten a chat-component MOTD (text + extra[]) to a plain string. */
function extractText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  const n = node as { text?: string; extra?: unknown[] };
  let out = n.text ?? "";
  if (Array.isArray(n.extra)) out += n.extra.map(extractText).join("");
  return out;
}
