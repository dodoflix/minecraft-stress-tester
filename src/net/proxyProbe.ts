import type { Socket } from "node:net";
import type { ProxyCheck } from "./autoProxies.js";
import { openProxyTunnel } from "./proxyConnect.js";

/**
 * Health-check a free proxy by opening a tunnel to the target AND doing a real Minecraft
 * status handshake through it. A weaker "did the TCP tunnel open?" check gives false positives:
 * many SOCKS proxies report success without truly reaching the destination, and against a
 * loopback target they connect to their own localhost. Requiring an actual status reply means a
 * proxy only counts if a Minecraft server really answers through it. Network I/O, excluded from
 * coverage (autoProxies' orchestration is tested with an injected validator).
 */
export async function probeProxy(
  proxy: string,
  host: string,
  port: number,
  timeoutMs = 8000,
): Promise<ProxyCheck> {
  const start = Date.now();
  try {
    const socket = await openProxyTunnel(proxy, host, port, timeoutMs);
    await minecraftStatus(socket, host, port, timeoutMs);
    return { proxy, ok: true, latencyMs: Date.now() - start };
  } catch {
    return { proxy, ok: false };
  }
}

function varInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    bytes.push(b);
  } while (v);
  return Buffer.from(bytes);
}

function mcString(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([varInt(b.length), b]);
}

/** Read a varint at offset; [value, bytesRead] or null if the buffer doesn't hold a full one. */
function readVarInt(buf: Buffer, offset: number): [number, number] | null {
  let value = 0;
  let shift = 0;
  let i = offset;
  while (i < buf.length) {
    const b = buf[i++] as number;
    value |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [value >>> 0, i - offset];
    shift += 7;
    if (shift > 35) return [value >>> 0, i - offset]; // malformed; treat as read
  }
  return null;
}

/** Send an SLP handshake + status request over the socket; resolve once a status packet replies. */
function minecraftStatus(socket: Socket, host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(timeoutMs, () => done(new Error("status timed out")));
    socket.on("error", (e) => done(e));
    socket.on("close", () => done(new Error("closed before status")));
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const header = readVarInt(buf, 0);
      if (!header) return; // packet length not fully received yet
      const [pktLen, lenBytes] = header;
      if (buf.length < lenBytes + pktLen) return; // wait for the whole packet
      const id = readVarInt(buf, lenBytes); // status response packet id must be 0x00
      if (id && id[0] === 0x00) done();
      else done(new Error("not a status response"));
    });

    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(port);
    const framed = (...parts: Buffer[]) => {
      const body = Buffer.concat(parts);
      return Buffer.concat([varInt(body.length), body]);
    };
    // Handshake (next state = 1, status) then a status request.
    const handshake = framed(varInt(0x00), varInt(47), mcString(host), portBuf, varInt(1));
    const request = framed(varInt(0x00));
    socket.write(Buffer.concat([handshake, request]));
  });
}
