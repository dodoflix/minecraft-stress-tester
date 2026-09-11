import mc from "minecraft-protocol";

export interface PreflightResult {
  motd: string;
  versionName: string;
  protocol: number;
  online: number;
  max: number;
  latencyMs: number;
}

/** Server-list-ping the target before any load: proves reachability and reports version/players/RTT. */
export async function preflight(host: string, port: number, version?: string): Promise<PreflightResult> {
  const res: any = await new Promise((resolve, reject) => {
    mc.ping({ host, port, version: version ?? false } as any, (err: any, result) => {
      if (err) reject(new Error(`cannot reach ${host}:${port} — ${err.code || err.message || err}`));
      else resolve(result);
    });
  });

  const desc = res.description;
  const motd =
    typeof desc === "string" ? desc : desc?.text ?? extractText(desc) ?? "";

  return {
    motd: String(motd).replace(/§[0-9a-fk-or]/gi, "").trim(),
    versionName: res.version?.name ?? "unknown",
    protocol: Number(res.version?.protocol ?? 0),
    online: Number(res.players?.online ?? 0),
    max: Number(res.players?.max ?? 0),
    latencyMs: Number(res.latency ?? 0),
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
