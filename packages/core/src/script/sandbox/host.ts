import { Worker } from "node:worker_threads";
import type { BotApiEventMap, DebugBot } from "../../bot/botApi.js";
import { dispatchScriptCall, type FromWorker, SCRIPT_BOT_EVENTS, type ScriptBotEvent } from "./protocol.js";

/** Parse-check user code in the isolate without running it (no bot needed). Returns any syntax error. */
export function checkUserScript(code: string): Promise<{ ok: boolean; error?: string }> {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    workerData: { code, mode: "check" },
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8 },
    env: {},
  });
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      resolve(result);
    };
    worker.on("message", (msg: FromWorker) => {
      if (msg.type === "done") done({ ok: true });
      else if (msg.type === "error") done({ ok: false, error: msg.message });
    });
    worker.on("error", (e) => done({ ok: false, error: e.message }));
  });
}

/** A live bot: acts (DebugBot) and can be subscribed to and unsubscribed from (a BotApi). */
export type ScriptHostBot = DebugBot & {
  on<E extends keyof BotApiEventMap>(event: E, listener: (...args: BotApiEventMap[E]) => void): unknown;
  off<E extends keyof BotApiEventMap>(event: E, listener: (...args: BotApiEventMap[E]) => void): unknown;
};

export interface SandboxOptions {
  /** Wall-clock cap; the worker is terminated when it elapses. Default 30s. */
  timeoutMs?: number;
  /** Worker heap cap in MiB; exceeding it crashes the isolate, not the host. Default 128. */
  memoryMb?: number;
  onLog?: (level: "log" | "warn" | "error", args: unknown[]) => void;
}

// Only structured-cloneable event payloads cross the worker boundary; drop anything that would throw.
function cloneable(args: unknown[]): unknown[] {
  return args.map((a) => {
    try {
      return structuredClone(a);
    } catch {
      return String(a);
    }
  });
}

/**
 * Run untrusted user code against one bot inside a worker-thread isolate (its own V8 heap). The
 * isolate can reach the host only by posting Bot API calls, which are validated against the
 * allowlist here (`dispatchScriptCall`) before touching the bot; it has no fs/net/env of the host,
 * a memory cap, and a wall-clock timeout. Networked/threaded I/O, excluded from coverage; the
 * allowlist + dispatch logic it relies on is unit-tested in protocol.ts.
 *
 * Threat model: this protects the host process and bounds CPU/memory, and is meant for the local,
 * authorized, localhost-by-default posture. A `node:vm` escape inside the worker would reach the
 * worker realm, so do not expose script execution to untrusted networks.
 */
export function runUserScript(
  bot: ScriptHostBot,
  code: string,
  opts: SandboxOptions = {},
  mode: "run" | "check" = "run",
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const memoryMb = opts.memoryMb ?? 128;
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    workerData: { code, mode },
    resourceLimits: { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: 16 },
    env: {}, // deny the isolate the host's environment variables
  });

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const listeners: Array<[ScriptBotEvent, (...a: unknown[]) => void]> = [];
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const [event, fn] of listeners) bot.off(event as keyof BotApiEventMap, fn as never);
      void worker.terminate();
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error(`script timed out after ${timeoutMs}ms`)), timeoutMs);

    for (const event of SCRIPT_BOT_EVENTS) {
      const fn = (...args: unknown[]) => worker.postMessage({ type: "event", event, args: cloneable(args) });
      bot.on(event as keyof BotApiEventMap, fn as never);
      listeners.push([event, fn]);
    }

    worker.on("message", (msg: FromWorker) => {
      if (msg.type === "call") {
        dispatchScriptCall(bot, msg.method, msg.args)
          .then((value) =>
            worker.postMessage({ type: "result", id: msg.id, ok: true, value: cloneable([value])[0] }),
          )
          .catch((e) =>
            worker.postMessage({
              type: "result",
              id: msg.id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
      } else if (msg.type === "log") {
        opts.onLog?.(msg.level, msg.args);
      } else if (msg.type === "done") {
        finish();
      } else if (msg.type === "error") {
        finish(new Error(msg.message));
      }
    });
    worker.on("error", (e) => finish(e));
    worker.on("exit", (exitCode) =>
      finish(exitCode === 0 ? undefined : new Error(`isolate exited with code ${exitCode}`)),
    );
  });
}
