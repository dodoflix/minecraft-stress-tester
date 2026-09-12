import { createContext, runInContext, Script } from "node:vm";
import { parentPort, workerData } from "node:worker_threads";
import { SCRIPT_BOT_EVENTS, SCRIPT_BOT_METHODS, type ScriptBotEvent, type ToWorker } from "./protocol.js";

// Runs inside the worker isolate. User code is executed in a fresh vm context that has only the
// injected `bot`/`console`/`sleep` plus standard JS builtins: no require, process, fs, or net by
// name. Every bot method is an async RPC to the host, which enforces the allowlist. Excluded from
// coverage (thread + vm I/O).

if (!parentPort) throw new Error("sandbox worker requires a parentPort");
const port = parentPort;

const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const handlers = new Map<ScriptBotEvent, Array<(...a: unknown[]) => void>>();
let nextId = 1;

function call(method: string, args: unknown[]): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    port.postMessage({ type: "call", id, method, args });
  });
}

const bot: Record<string, unknown> = {
  on(event: ScriptBotEvent, handler: (...a: unknown[]) => void) {
    if (!SCRIPT_BOT_EVENTS.includes(event)) throw new Error(`unknown event: ${event}`);
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  },
};
for (const method of SCRIPT_BOT_METHODS) bot[method] = (...args: unknown[]) => call(method, args);

const post = (level: "log" | "warn" | "error", args: unknown[]) =>
  port.postMessage({ type: "log", level, args: args.map((a) => String(a)) });
const sandboxConsole = {
  log: (...a: unknown[]) => post("log", a),
  warn: (...a: unknown[]) => post("warn", a),
  error: (...a: unknown[]) => post("error", a),
};
const sleep = (ms: number) =>
  new Promise((r) => setTimeout(r, Math.max(0, Math.min(Number(ms) || 0, 60_000))));

port.on("message", (msg: ToWorker) => {
  if (msg.type === "result") {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error ?? "bot call failed"));
  } else if (msg.type === "event") {
    for (const h of handlers.get(msg.event) ?? []) {
      try {
        h(...msg.args);
      } catch {
        // a throwing user handler must not take down the isolate
      }
    }
  }
});

const { code, mode } = workerData as { code: string; mode: "run" | "check" };
const context = createContext({ bot, console: sandboxConsole, sleep });
const wrapped = `(async () => {\n${code}\n})()`;
const fail = (e: unknown) =>
  port.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });

if (mode === "check") {
  // Parse only: surface syntax errors without executing anything.
  try {
    new Script(wrapped);
    port.postMessage({ type: "done" });
  } catch (e) {
    fail(e);
  }
} else {
  Promise.resolve()
    .then(() => runInContext(wrapped, context))
    .then(() => port.postMessage({ type: "done" }))
    .catch(fail);
}
