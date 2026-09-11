import type { ProxyCheck } from "./autoProxies.js";
import { openProxyTunnel } from "./proxyConnect.js";

/**
 * Health-check a free proxy: can it tunnel to the target, and how fast? Opens and immediately
 * closes a tunnel, timing it. Network I/O, excluded from coverage (autoProxies' orchestration
 * is tested with an injected validator).
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
    socket.destroy();
    return { proxy, ok: true, latencyMs: Date.now() - start };
  } catch {
    return { proxy, ok: false };
  }
}
