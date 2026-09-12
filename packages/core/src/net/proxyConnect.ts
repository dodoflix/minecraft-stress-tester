import type { Socket } from "node:net";
import type { Client } from "minecraft-protocol";
import { SocksClient } from "socks";
import { parseProxy } from "./proxy.js";

/**
 * Hard timeout wrapper: guarantees the attempt settles within `ms`, whatever the underlying
 * library does (SOCKS negotiations against a live-but-stalled proxy can otherwise hang past any
 * per-connection timeout). A socket that arrives after we already timed out is destroyed so it
 * doesn't leak an open handle.
 */
function withTimeout(attempt: Promise<Socket>, ms: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("proxy probe timed out"));
      }
    }, ms);
    attempt.then(
      (socket) => {
        if (settled) {
          socket.destroy();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(socket);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Open a raw tunnel to host:port through a SOCKS5/4 proxy. (Free HTTP proxies block CONNECT to
 * non-443 ports, so they are useless for game ports and not supported.) Socket I/O, excluded
 * from coverage; the proxy parsing and pool/auto-proxy logic are tested.
 */
export function openProxyTunnel(
  proxy: string,
  host: string,
  port: number,
  timeoutMs = 8000,
): Promise<Socket> {
  const p = parseProxy(proxy);
  const attempt = SocksClient.createConnection({
    proxy: {
      host: p.host,
      port: p.port,
      type: p.scheme === "socks4" ? 4 : 5,
      userId: p.userId,
      password: p.password,
    },
    command: "connect",
    destination: { host, port },
    timeout: timeoutMs,
  }).then((r) => r.socket);
  return withTimeout(attempt, timeoutMs);
}

/**
 * Build a minecraft-protocol `connect` function that routes the game socket through a proxy.
 */
export function makeProxyConnect(proxy: string, host: string, port: number): (client: Client) => void {
  return (client) => {
    openProxyTunnel(proxy, host, port)
      .then((socket) => {
        client.setSocket(socket);
        client.emit("connect");
      })
      .catch((err: unknown) => client.emit("error", err instanceof Error ? err : new Error(String(err))));
  };
}
