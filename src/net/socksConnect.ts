import type { Client } from "minecraft-protocol";
import { SocksClient } from "socks";
import { parseProxy } from "./proxy.js";

/**
 * Build a minecraft-protocol `connect` function that tunnels the game socket through a
 * SOCKS5 proxy. Socket I/O, excluded from coverage (the parse + pool logic are tested).
 */
export function makeSocksConnect(proxy: string, host: string, port: number): (client: Client) => void {
  const p = parseProxy(proxy);
  return (client) => {
    SocksClient.createConnection({
      proxy: { host: p.host, port: p.port, type: 5, userId: p.userId, password: p.password },
      command: "connect",
      destination: { host, port },
    })
      .then(({ socket }) => {
        client.setSocket(socket);
        client.emit("connect");
      })
      .catch((err: unknown) => client.emit("error", err instanceof Error ? err : new Error(String(err))));
  };
}
