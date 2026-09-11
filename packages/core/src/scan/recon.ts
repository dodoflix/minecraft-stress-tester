import { createBot } from "mineflayer";
import type { BotSpec } from "../drivers/driver.js";

export interface ReconResult {
  brand?: string;
  commands: string[];
}

/**
 * Join one bot and gather client-observable recon: the server brand (minecraft:brand payload)
 * and the command list from a "/" tab-complete. Best-effort and non-destructive; any failure
 * yields an empty result rather than throwing. Network I/O, excluded from coverage.
 */
export function deepRecon(spec: BotSpec, timeoutMs = 15000): Promise<ReconResult> {
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
      resolve({ brand, commands });
    };
    const timer = setTimeout(() => finish([]), timeoutMs);

    bot._client.on("custom_payload", (p: { channel?: string; data?: unknown }) => {
      if (p?.channel === "minecraft:brand" || p?.channel === "brand") {
        const data = p.data;
        const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data ?? "");
        brand = text.replace(/[^\x20-\x7e]/g, "").trim() || undefined;
      }
    });

    bot.once("spawn", () => {
      bot
        .tabComplete("/")
        .then((matches: unknown[]) => {
          const commands = (matches ?? [])
            .map((m) => (typeof m === "string" ? m : ((m as { match?: string })?.match ?? "")))
            .filter(Boolean);
          finish(commands);
        })
        .catch(() => finish([]));
    });
    bot.once("error", () => finish([]));
    bot.once("end", () => finish([]));
  });
}
