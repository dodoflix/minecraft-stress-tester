// Bidirectional WebSocket protocol for the control-plane. SSE stays the one-way metrics stream;
// this channel carries the remote debug console and live script control. Pure message shapes +
// validation (no sockets), so it is unit-tested. The API is versioned via the `hello` message.

export const WS_PROTOCOL_VERSION = 1;

export interface AttachMessage {
  type: "attach";
  id?: string;
  target: { host: string; port?: number; version?: string };
  authorized: boolean;
}
export interface DebugMessage {
  type: "debug";
  id?: string;
  line: string;
}
export interface ScriptStartMessage {
  type: "script.start";
  id?: string;
  code: string;
  timeoutMs?: number;
}
export interface ScriptStopMessage {
  type: "script.stop";
  id?: string;
}
export interface PingMessage {
  type: "ping";
  id?: string;
}
export type WsClientMessage =
  | AttachMessage
  | DebugMessage
  | ScriptStartMessage
  | ScriptStopMessage
  | PingMessage;

export type WsServerMessage =
  | { type: "hello"; protocol: number; version: string }
  | { type: "ack"; id?: string; ok: boolean; error?: string }
  | { type: "result"; id?: string; text: string; done?: boolean }
  | { type: "event"; event: string; data?: unknown }
  | { type: "log"; level: string; args: unknown[] }
  | { type: "script.done"; error?: string }
  | { type: "pong"; id?: string }
  | { type: "error"; id?: string; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Validate one incoming WebSocket message (parsed from JSON). Pure. */
export function parseWsMessage(
  raw: unknown,
): { ok: true; message: WsClientMessage } | { ok: false; error: string } {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, error: "invalid JSON" };
    }
  }
  if (!isObj(obj) || typeof obj.type !== "string") return { ok: false, error: "missing type" };
  const id = typeof obj.id === "string" ? obj.id : undefined;
  switch (obj.type) {
    case "attach": {
      if (!isObj(obj.target) || typeof obj.target.host !== "string" || !obj.target.host) {
        return { ok: false, error: "attach requires target.host" };
      }
      const t = obj.target;
      return {
        ok: true,
        message: {
          type: "attach",
          id,
          authorized: obj.authorized === true,
          target: {
            host: t.host as string,
            port: typeof t.port === "number" ? t.port : undefined,
            version: typeof t.version === "string" ? t.version : undefined,
          },
        },
      };
    }
    case "debug":
      if (typeof obj.line !== "string") return { ok: false, error: "debug requires line" };
      return { ok: true, message: { type: "debug", id, line: obj.line } };
    case "script.start":
      if (typeof obj.code !== "string") return { ok: false, error: "script.start requires code" };
      return {
        ok: true,
        message: {
          type: "script.start",
          id,
          code: obj.code,
          timeoutMs: typeof obj.timeoutMs === "number" ? obj.timeoutMs : undefined,
        },
      };
    case "script.stop":
      return { ok: true, message: { type: "script.stop", id } };
    case "ping":
      return { ok: true, message: { type: "ping", id } };
    default:
      return { ok: false, error: `unknown message type: ${obj.type}` };
  }
}

export function hello(version: string): WsServerMessage {
  return { type: "hello", protocol: WS_PROTOCOL_VERSION, version };
}
