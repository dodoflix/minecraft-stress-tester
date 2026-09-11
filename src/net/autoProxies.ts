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

/** Fetch and parse every provider, tolerating individual failures. Dedupes the union. */
export async function fetchFreeProxies(
  providers: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const lists = await Promise.all(
    providers.map(async (url) => {
      try {
        // A provider that hangs must not stall the whole run; bound each fetch.
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return [];
        return parseProxyList(await res.text());
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
  // Health-checking every fetched proxy (thousands, mostly dead, one timeout each) takes many
  // minutes. Shuffle, cap the pool, probe with high concurrency, and stop once we have `max`.
  const candidates = shuffle(fetched).slice(0, opts.maxProbes ?? 400);
  const ok = await probeUntil(candidates, validator, max, opts.concurrency ?? 100, opts.onProgress);
  return pickValidated(ok, max);
}
