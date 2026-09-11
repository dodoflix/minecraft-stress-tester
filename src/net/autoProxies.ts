import { probeProxy } from "./proxyProbe.js";

/** A provider is a list URL plus the proxy scheme its bare lines carry (default socks5). */
export type ProxyProvider = string | { url: string; scheme?: string };

/**
 * Public free-proxy lists that need no registration or payment. Each is a plain-text list
 * (one `ip:port` or `scheme://ip:port` per line) hosted on GitHub raw or a keyless API. Free
 * proxies are unreliable and untrustworthy, so we over-fetch across many sources and validate
 * hard (see resolveAutoProxies). SOCKS5/SOCKS4 only: they tunnel arbitrary TCP, so they work for
 * game ports, unlike free HTTP proxies which block CONNECT to non-443 ports.
 */
export const DEFAULT_PROVIDERS: ProxyProvider[] = [
  // socks5
  { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt", scheme: "socks5" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", scheme: "socks5" },
  {
    url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt",
    scheme: "socks5",
  },
  { url: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt", scheme: "socks5" },
  {
    url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt",
    scheme: "socks5",
  },
  {
    url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt",
    scheme: "socks5",
  },
  { url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt", scheme: "socks5" },
  {
    url: "https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=10000&country=all",
    scheme: "socks5",
  },
  // socks4
  { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt", scheme: "socks4" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt", scheme: "socks4" },
  {
    url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt",
    scheme: "socks4",
  },
  {
    url: "https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks4&timeout=10000&country=all",
    scheme: "socks4",
  },
];

const LINE = /^(?:(socks5|socks4):\/\/)?([\w.-]+):(\d{1,5})$/;

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

/**
 * Keep the reachable proxies, fastest first, capped at max. Ties break on the proxy string so
 * the result is deterministic regardless of the order probes finished in. Pure.
 */
export function pickValidated(checks: ProxyCheck[], max: number): string[] {
  return checks
    .filter((c) => c.ok)
    .sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity) || a.proxy.localeCompare(b.proxy))
    .slice(0, max)
    .map((c) => c.proxy);
}

/** Fisher-Yates shuffle (copy). Spreads probing across the list instead of the dead head. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * Probe candidates with bounded concurrency, collecting the reachable ones, and stop early once
 * `need` have been found. Free proxies are mostly dead, so probing all of them would take many
 * minutes; this caps the work. `onProgress` reports periodically so a run never looks stuck.
 */
async function probeUntil(
  candidates: string[],
  validator: (proxy: string) => Promise<ProxyCheck>,
  need: number,
  limit: number,
  onProgress?: (p: { checked: number; total: number; ok: number }) => void,
): Promise<ProxyCheck[]> {
  const ok: ProxyCheck[] = [];
  let next = 0;
  let checked = 0;
  let done = false;
  const worker = async () => {
    while (!done) {
      const i = next++;
      if (i >= candidates.length) return;
      const res = await validator(candidates[i] as string);
      checked++;
      if (res.ok) ok.push(res);
      onProgress?.({ checked, total: candidates.length, ok: ok.length });
      if (ok.length >= need) done = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, candidates.length) }, worker));
  return ok;
}

function providerParts(p: ProxyProvider): { url: string; scheme: string } {
  return typeof p === "string" ? { url: p, scheme: "socks5" } : { url: p.url, scheme: p.scheme ?? "socks5" };
}

/** Fetch and parse every provider (tagging bare lines with its scheme), tolerating individual
 * failures. Dedupes the union. A plain-string provider defaults to the socks5 scheme. */
export async function fetchFreeProxies(
  providers: ProxyProvider[],
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const lists = await Promise.all(
    providers.map(async (p) => {
      const { url, scheme } = providerParts(p);
      try {
        // A provider that hangs must not stall the whole run; bound each fetch.
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return [];
        return parseProxyList(await res.text(), scheme);
      } catch {
        return []; // a dead/slow provider must not sink the whole fetch
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
  /** Per-proxy health-check timeout (ms). */
  timeoutMs?: number;
  /** Cap on how many fetched proxies to health-check (they are shuffled first). */
  maxProbes?: number;
  fetchImpl?: typeof fetch;
  validator?: (proxy: string) => Promise<ProxyCheck>;
  onProgress?: (p: { checked: number; total: number; ok: number }) => void;
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

  const timeoutMs = opts.timeoutMs ?? 4000;
  const validator = opts.validator ?? ((proxy) => probeProxy(proxy, target.host, target.port, timeoutMs));
  // Shuffle, then probe with high concurrency, stopping once we have `max` usable. `maxProbes`
  // caps how much of the pool we touch (probing all of it, mostly dead, is slow); unset means
  // probe the whole pool until `max` are found.
  const candidates = shuffle(fetched).slice(0, opts.maxProbes ?? fetched.length);
  const ok = await probeUntil(candidates, validator, max, opts.concurrency ?? 100, opts.onProgress);
  return pickValidated(ok, max);
}
