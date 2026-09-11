import { probeProxy } from "./proxyProbe.js";

/**
 * Public free-proxy lists that need no registration or payment. Each is a plain-text list
 * (one proxy per line) hosted on GitHub raw. Free proxies are unreliable and untrustworthy,
 * so we over-fetch and validate hard (see resolveAutoProxies). SOCKS5 sources by default,
 * since HTTP CONNECT to arbitrary game ports is usually blocked on free HTTP proxies.
 */
export const DEFAULT_PROVIDERS = [
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt",
];

const LINE = /^(?:(socks5|socks4|http|https):\/\/)?([\w.-]+):(\d{1,5})$/;

/**
 * Parse a proxy list into normalized `scheme://host:port` strings. Accepts bare `host:port`
 * (tagged with defaultScheme) and `scheme://host:port`; skips comments and junk lines. Pure.
 */
export function parseProxyList(text: string, defaultScheme = "socks5"): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    const port = Number(m[3]);
    if (port < 1 || port > 65535) continue;
    out.push(`${m[1] ?? defaultScheme}://${m[2]}:${port}`);
  }
  return out;
}

/** Merge lists and drop duplicates, preserving first-seen order. Pure. */
export function dedupeProxies(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const p of list) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
}

export interface ProxyCheck {
  proxy: string;
  ok: boolean;
  latencyMs?: number;
}

/** Keep the reachable proxies, fastest first, capped at max. Pure. */
export function pickValidated(checks: ProxyCheck[], max: number): string[] {
  return checks
    .filter((c) => c.ok)
    .sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity))
    .slice(0, max)
    .map((c) => c.proxy);
}

/** Run an async worker over items with bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Fetch and parse every provider, tolerating individual failures. Dedupes the union. */
export async function fetchFreeProxies(
  providers: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const lists = await Promise.all(
    providers.map(async (url) => {
      try {
        const res = await fetchImpl(url);
        if (!res.ok) return [];
        return parseProxyList(await res.text());
      } catch {
        return []; // a dead provider must not sink the whole fetch
      }
    }),
  );
  return dedupeProxies(lists);
}

export interface ResolveOptions {
  providers?: string[];
  validate?: boolean;
  max?: number;
  concurrency?: number;
  fetchImpl?: typeof fetch;
  validator?: (proxy: string) => Promise<ProxyCheck>;
}

/**
 * The full pipeline: fetch free proxies, optionally health-check them against the target,
 * and return the best `max`. All I/O is injectable (fetchImpl, validator) so the orchestration
 * is unit-tested; the default validator (probeProxy) does a real handshake through the proxy.
 */
export async function resolveAutoProxies(
  target: { host: string; port: number },
  opts: ResolveOptions = {},
): Promise<string[]> {
  const providers = opts.providers?.length ? opts.providers : DEFAULT_PROVIDERS;
  const max = opts.max ?? 50;
  const fetched = await fetchFreeProxies(providers, opts.fetchImpl);
  if (!fetched.length) return [];

  if (opts.validate === false) return fetched.slice(0, max);

  const validator = opts.validator ?? ((proxy) => probeProxy(proxy, target.host, target.port));
  const checks = await mapLimit(fetched, opts.concurrency ?? 50, validator);
  return pickValidated(checks, max);
}
