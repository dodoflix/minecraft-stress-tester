import { createBot } from "mineflayer";
import type { BotSpec } from "../drivers/driver.js";
import { inferFromCommands } from "./plugins.js";

export interface ReconResult {
  brand?: string;
  commands: string[];
  /** Plugin-message channels the server registered/used (namespaces identify plugins). */
  channels: string[];
  /** Chat lines captured while probing `/version <plugin>` (best-effort version detection). */
  versionLines?: string[];
}

export interface ReconOptions {
  probeVersions?: boolean;
}

/**
 * Join one bot and gather client-observable recon: the server brand, the registered plugin-message
 * channels, the "/" tab-complete command list, and (with probeVersions) chat replies to read-only
 * `/version <plugin>` commands. Best-effort and non-destructive; any failure yields a partial/empty
 * result rather than throwing. Network I/O, excluded from coverage.
 */
export function deepRecon(spec: BotSpec, opts: ReconOptions = {}, timeoutMs = 15000): Promise<ReconResult> {
  return new Promise((resolve) => {
    const bot = createBot({
      host: spec.host,
      port: spec.port,
      username: spec.username,
      auth: spec.auth,
      version: spec.version,
      hideErrors: true,
      profilesFolder: spec.profilesFolder,
    } as unknown as Parameters<typeof createBot>[0]);

    let brand: string | undefined;
    const channels = new Set<string>();
    const versionLines: string[] = [];
    let settled = false;
    const finish = (commands: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        bot.quit("scan complete");
      } catch {
        // already gone
      }
      resolve({ brand, commands, channels: [...channels], versionLines });
    };
    const timer = setTimeout(() => finish([]), timeoutMs);

    const decode = (data: unknown): string =>
      (Buffer.isBuffer(data) ? data.toString("utf8") : String(data ?? "")).replace(/[^\x20-\x7e\0]/g, "");

    bot._client.on("custom_payload", (p: { channel?: string; data?: unknown }) => {
      const channel = p?.channel;
      if (!channel) return;
      if (channel === "minecraft:brand" || channel === "brand") {
        brand = decode(p.data).replace(/\0/g, "").trim() || undefined;
        return;
      }
      // A REGISTER payload is a null-separated list of channels the server supports.
      if (channel === "minecraft:register" || channel === "REGISTER") {
        for (const c of decode(p.data).split("\0")) if (c.trim()) channels.add(c.trim());
        return;
      }
      channels.add(channel);
    });

    bot.on("messagestr", (msg: string) => {
      if (versionLines.length < 200) versionLines.push(msg);
    });

    bot.once("spawn", () => {
      bot
        .tabComplete("/")
        .then((matches: unknown[]) => {
          const commands = (matches ?? [])
            .map((m) => (typeof m === "string" ? m : ((m as { match?: string })?.match ?? "")))
            .filter(Boolean);
          if (!opts.probeVersions) return finish(commands);
          // Best-effort, read-only version probe: ask /version for each candidate plugin, then wait
          // a short window for the replies before finishing.
          const names = inferFromCommands(commands).map((d) => d.name);
          names.slice(0, 20).forEach((name, i) => {
            setTimeout(() => {
              try {
                bot.chat(`/version ${name}`);
              } catch {
                // ignore send failures
              }
            }, i * 250);
          });
          setTimeout(() => finish(commands), Math.min(names.length * 250 + 2000, timeoutMs));
        })
        .catch(() => finish([]));
    });
    bot.once("error", () => finish([]));
    bot.once("end", () => finish([]));
  });
}
