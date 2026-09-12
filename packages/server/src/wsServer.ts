import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  BotApi,
  type BotSpec,
  buildRunConfig,
  dispatch,
  type ScriptHostBot,
  type ScriptRun,
  startUserScript,
} from "minecraft-stress-tester";
import { WebSocket, WebSocketServer } from "ws";
import { hello, parseWsMessage, type WsServerMessage } from "./wsProtocol.js";
import { handleWsMessage, type WsDeps } from "./wsRouter.js";

/**
 * The bidirectional WebSocket transport: a remote debug console and live script control over one
 * socket (SSE stays the one-way metrics stream). Token-gated on the same bind as the REST API;
 * per-connection it attaches one bot and drives it via the pure REPL + sandbox. Socket I/O,
 * excluded from coverage; the message protocol and routing (wsProtocol/wsRouter) are unit-tested.
 */
export function attachWsServer(server: Server, ctx: { token: string; version: string }): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") return; // not ours; leave it for anyone else
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : (url.searchParams.get("token") ?? "");
    if (token !== ctx.token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => setupSession(ws, ctx));
  });

  return wss;
}

function specFor(target: { host: string; port?: number; version?: string }): BotSpec | null {
  const built = buildRunConfig({ authorized: true, target });
  if (!built.success || !built.config) return null;
  const config = built.config;
  return {
    id: 0,
    username: `${config.accounts.usernamePrefix}-ws`,
    host: config.target.host,
    port: config.target.port,
    version: config.target.version ?? false,
    auth: config.accounts.mode,
    profilesFolder: config.accounts.profilesFolder,
    config,
  };
}

function setupSession(ws: WebSocket, ctx: { token: string; version: string }): void {
  let bot: BotApi | null = null;
  let script: ScriptRun | null = null;
  const send = (msg: WsServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const deps: WsDeps = {
    version: ctx.version,
    attach: async (target, authorized) => {
      if (!authorized) return { ok: false, error: "authorization not confirmed" };
      const spec = specFor(target);
      if (!spec) return { ok: false, error: "invalid target" };
      try {
        bot?.disconnect();
        bot = await BotApi.connect(spec);
        for (const event of ["chat", "kicked", "end"] as const) {
          bot.on(event, (data: unknown) => send({ type: "event", event, data }));
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    get dispatch() {
      return bot ? (line: string) => dispatch(line, bot as BotApi) : null;
    },
    startScript: (code, timeoutMs) => {
      if (!bot) return { ok: false, error: "attach a bot first" };
      script?.stop();
      script = startUserScript(bot as unknown as ScriptHostBot, code, {
        timeoutMs,
        onLog: (level, args) => send({ type: "log", level, args }),
      });
      script.done.then(
        () => send({ type: "script.done" }),
        (e: unknown) => send({ type: "script.done", error: e instanceof Error ? e.message : String(e) }),
      );
      return { ok: true };
    },
    stopScript: () => script?.stop(),
  };

  send(hello(ctx.version));
  ws.on("message", async (raw) => {
    const parsed = parseWsMessage(raw.toString());
    if (!parsed.ok) return send({ type: "error", error: parsed.error });
    for (const out of await handleWsMessage(parsed.message, deps)) send(out);
  });
  ws.on("close", () => {
    script?.stop();
    bot?.disconnect();
  });
}
