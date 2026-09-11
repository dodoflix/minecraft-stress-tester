import { type Socket, connect as tcpConnect } from "node:net";
import type { Client } from "minecraft-protocol";
import { SocksClient } from "socks";
import { type ParsedProxy, parseProxy } from "./proxy.js";

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
 * Open a raw tunnel to host:port through a proxy (SOCKS5/4 or HTTP CONNECT). Socket I/O,
 * excluded from coverage; the proxy parsing and pool/auto-proxy logic are tested.
 */
export function openProxyTunnel(
  proxy: string,
  host: string,
  port: number,
  timeoutMs = 8000,
): Promise<Socket> {
  const p = parseProxy(proxy);
  const attempt =
    p.scheme === "http" || p.scheme === "https"
      ? httpConnect(p, host, port, timeoutMs)
      : SocksClient.createConnection({
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

function httpConnect(p: ParsedProxy, host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = tcpConnect(p.port, p.host);
    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error("proxy CONNECT timed out")));
    socket.once("error", fail);
    socket.once("connect", () => {
      let head = `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n`;
      if (p.userId) {
        const creds = Buffer.from(`${p.userId}:${p.password ?? ""}`).toString("base64");
        head += `Proxy-Authorization: Basic ${creds}\r\n`;
      }
      socket.write(`${head}\r\n`);
    });
    socket.once("data", (chunk) => {
      // The proxy answers the CONNECT with a status line; 2xx means the tunnel is open.
      const status = Number(chunk.toString("latin1").split(" ")[1]);
      if (status >= 200 && status < 300) {
        socket.setTimeout(0);
        socket.removeListener("error", fail);
        resolve(socket);
      } else {
        fail(new Error(`proxy CONNECT rejected: HTTP ${status || "?"}`));
      }
    });
  });
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
