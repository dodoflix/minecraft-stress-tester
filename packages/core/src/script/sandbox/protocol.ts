import type { DebugBot } from "../../bot/botApi.js";

/**
 * The only Bot API methods a user script may call. The host validates every incoming call against
 * this allowlist before touching the bot, so even a compromised isolate can reach nothing beyond
 * this fixed surface. Keep it in sync with DebugBot; `disconnect` is intentionally omitted (the host
 * owns the bot's lifecycle).
 */
export const SCRIPT_BOT_METHODS = [
  "chat",
  "command",
  "look",
  "setControl",
  "goto",
  "stop",
  "position",
  "vitals",
  "players",
  "nearbyEntities",
  "inventory",
] as const;

export type ScriptBotMethod = (typeof SCRIPT_BOT_METHODS)[number];

/** Bot events forwarded into a script's `bot.on(event, handler)`. */
export const SCRIPT_BOT_EVENTS = ["chat", "death", "kicked", "end", "error"] as const;
export type ScriptBotEvent = (typeof SCRIPT_BOT_EVENTS)[number];

export function isScriptBotMethod(method: unknown): method is ScriptBotMethod {
  return typeof method === "string" && (SCRIPT_BOT_METHODS as readonly string[]).includes(method);
}

// Messages the worker (isolate) sends to the host.
export type CallMessage = { type: "call"; id: number; method: string; args: unknown[] };
export type LogMessage = { type: "log"; level: "log" | "warn" | "error"; args: unknown[] };
export type ReadyMessage = { type: "ready" };
export type DoneMessage = { type: "done" };
export type FailMessage = { type: "error"; message: string };
export type FromWorker = CallMessage | LogMessage | ReadyMessage | DoneMessage | FailMessage;

// Messages the host sends to the worker.
export type InitMessage = { type: "init"; code: string; mode: "run" | "check" };
export type ResultMessage = { type: "result"; id: number; ok: boolean; value?: unknown; error?: string };
export type EventMessage = { type: "event"; event: ScriptBotEvent; args: unknown[] };
export type ToWorker = InitMessage | ResultMessage | EventMessage;

/**
 * Execute one Bot API call requested by the isolate. Rejects any method not on the allowlist, so
 * the isolate can only ever drive the fixed Bot API surface. Async-aware; args arrive already
 * structured-cloned across the worker boundary. Pure with respect to the injected bot (unit-tested
 * with a fake); the real bot is networked I/O.
 */
export async function dispatchScriptCall(bot: DebugBot, method: string, args: unknown[]): Promise<unknown> {
  if (!isScriptBotMethod(method)) throw new Error(`method not allowed: ${method}`);
  const fn = (bot as unknown as Record<string, unknown>)[method];
  if (typeof fn !== "function") throw new Error(`method unavailable: ${method}`);
  return await (fn as (...a: unknown[]) => unknown).apply(bot, Array.isArray(args) ? args : []);
}
