export type ProxyScheme = "socks5" | "socks4";

export interface ParsedProxy {
  scheme: ProxyScheme;
  host: string;
  port: number;
  userId?: string;
  password?: string;
}

const SCHEMES: ProxyScheme[] = ["socks5", "socks4"];

/**
 * Parse "socks5://user:pass@host:1080", "socks4://host:1080", or bare "host:1080" (defaults to
 * socks5, port 1080). An unrecognized scheme falls back to socks5.
 */
export function parseProxy(url: string): ParsedProxy {
  const u = new URL(url.includes("://") ? url : `socks5://${url}`);
  const scheme = u.protocol.replace(":", "") as ProxyScheme;
  return {
    scheme: SCHEMES.includes(scheme) ? scheme : "socks5",
    host: u.hostname,
    port: u.port ? Number(u.port) : 1080,
    userId: u.username || undefined,
    password: u.password || undefined,
  };
}

/**
 * Hands out proxies round-robin, capping simultaneous bots per proxy so one source IP
 * isn't flooded (spreads connections past per-IP antibot limits). Pure bookkeeping.
 */
export class ProxyPool {
  private readonly active = new Map<string, number>();
  private idx = 0;

  constructor(
    private readonly list: string[],
    private readonly maxPerProxy: number,
  ) {}

  get enabled(): boolean {
    return this.list.length > 0;
  }

  /** Next proxy under its cap, or undefined if none configured / all saturated. */
  acquire(): string | undefined {
    if (!this.enabled) return undefined;
    for (let i = 0; i < this.list.length; i++) {
      const proxy = this.list[(this.idx + i) % this.list.length];
      if (proxy === undefined) continue;
      const n = this.active.get(proxy) ?? 0;
      if (n < this.maxPerProxy) {
        this.active.set(proxy, n + 1);
        this.idx = (this.idx + i + 1) % this.list.length;
        return proxy;
      }
    }
    return undefined; // every proxy at capacity
  }

  release(proxy: string | undefined): void {
    if (proxy === undefined) return;
    const n = this.active.get(proxy) ?? 0;
    if (n > 0) this.active.set(proxy, n - 1);
  }
}
