import type { ReplResult } from "minecraft-stress-tester";
import type { WsClientMessage, WsServerMessage } from "./wsProtocol.js";

/** I/O the WS session injects; the router stays pure and testable with fakes. */
export interface WsDeps {
  version: string;
  /** Connect a bot to the target; rejects unauthorized. */
  attach: (
    target: { host: string; port?: number; version?: string },
    authorized: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Run one debug REPL line against the attached bot, or null if none is attached. */
  dispatch: ((line: string) => Promise<ReplResult>) | null;
  /** Start a sandboxed user script against the attached bot. */
  startScript: (code: string, timeoutMs?: number) => { ok: boolean; error?: string };
  stopScript: () => void;
}

/**
 * Route one validated WS client message to server responses. Pure aside from the injected I/O
 * deps (bot attach / REPL dispatch / script control), so the routing is unit-tested.
 */
export async function handleWsMessage(msg: WsClientMessage, deps: WsDeps): Promise<WsServerMessage[]> {
  switch (msg.type) {
    case "ping":
      return [{ type: "pong", id: msg.id }];
    case "attach": {
      const r = await deps.attach(msg.target, msg.authorized);
      return [{ type: "ack", id: msg.id, ok: r.ok, error: r.error }];
    }
    case "debug": {
      if (!deps.dispatch) return [{ type: "error", id: msg.id, error: "attach a bot first" }];
      const r = await deps.dispatch(msg.line);
      return [{ type: "result", id: msg.id, text: r.text, done: r.done }];
    }
    case "script.start": {
      const r = deps.startScript(msg.code, msg.timeoutMs);
      return [{ type: "ack", id: msg.id, ok: r.ok, error: r.error }];
    }
    case "script.stop":
      deps.stopScript();
      return [{ type: "ack", id: msg.id, ok: true }];
  }
}
