import { describe, expect, it } from "vitest";
import {
  dedupeProxies,
  fetchFreeProxies,
  type ProxyCheck,
  parseProxyList,
  pickValidated,
  resolveAutoProxies,
  shuffle,
} from "../src/net/autoProxies.js";

/** A fake fetch returning n bare proxies "10.0.0.<i>:1080". */
const fetchN = (n: number): typeof fetch =>
  (async () => ({
    ok: true,
    text: async () => Array.from({ length: n }, (_, i) => `10.0.0.${i + 1}:1080`).join("\n"),
  })) as unknown as typeof fetch;

describe("parseProxyList", () => {
  it("normalizes bare and schemed lines, skipping junk and unsupported schemes", () => {
    const text = [
      "# comment",
      "1.2.3.4:1080",
      "socks5://5.6.7.8:1080",
      "socks4://8.8.8.8:1080",
      "http://9.9.9.9:8080", // unsupported scheme -> skipped
      "garbage",
      "",
    ].join("\n");
    expect(parseProxyList(text)).toEqual([
      "socks5://1.2.3.4:1080",
      "socks5://5.6.7.8:1080",
      "socks4://8.8.8.8:1080",
    ]);
  });

  it("honors a custom default scheme and rejects bad ports", () => {
    expect(parseProxyList("1.2.3.4:80", "http")).toEqual(["http://1.2.3.4:80"]);
    expect(parseProxyList("1.2.3.4:99999")).toEqual([]);
  });
});

describe("dedupeProxies", () => {
  it("merges lists preserving first-seen order", () => {
    expect(dedupeProxies([["a", "b"], ["b", "c"], ["a"]])).toEqual(["a", "b", "c"]);
  });
});

describe("pickValidated", () => {
  it("keeps reachable proxies fastest-first, capped, latency-less last", () => {
    const checks: ProxyCheck[] = [
      { proxy: "slow", ok: true, latencyMs: 300 },
      { proxy: "dead", ok: false },
      { proxy: "fast", ok: true, latencyMs: 50 },
      { proxy: "mid", ok: true, latencyMs: 100 },
      { proxy: "nolat", ok: true }, // no latency -> sorts last
    ];
    expect(pickValidated(checks, 3)).toEqual(["fast", "mid", "slow"]);
    expect(pickValidated(checks, 10)).toEqual(["fast", "mid", "slow", "nolat"]);
  });
});

describe("fetchFreeProxies", () => {
  const fakeFetch = (bodies: Record<string, string | null>): typeof fetch =>
    (async (url: string) => {
      const body = bodies[url];
      if (body === null || body === undefined) return { ok: false, text: async () => "" };
      return { ok: true, text: async () => body };
    }) as unknown as typeof fetch;

  it("fetches, parses, and dedupes across providers", async () => {
    const fetchImpl = fakeFetch({
      A: "1.1.1.1:1080\n2.2.2.2:1080",
      B: "2.2.2.2:1080\n3.3.3.3:1080",
    });
    expect(await fetchFreeProxies(["A", "B"], fetchImpl)).toEqual([
      "socks5://1.1.1.1:1080",
      "socks5://2.2.2.2:1080",
      "socks5://3.3.3.3:1080",
    ]);
  });

  it("tolerates a failing or throwing provider", async () => {
    const fetchImpl = (async (url: string) => {
      if (url === "boom") throw new Error("network");
      if (url === "notfound") return { ok: false, text: async () => "" };
      return { ok: true, text: async () => "1.1.1.1:1080" };
    }) as unknown as typeof fetch;
    expect(await fetchFreeProxies(["boom", "notfound", "ok"], fetchImpl)).toEqual(["socks5://1.1.1.1:1080"]);
  });
});

describe("resolveAutoProxies", () => {
  const target = { host: "localhost", port: 25565 };
  const fetchImpl = (async () => ({
    ok: true,
    text: async () => "1.1.1.1:1080\n2.2.2.2:1080\n3.3.3.3:1080",
  })) as unknown as typeof fetch;

  it("validates and returns the reachable proxies, fastest first", async () => {
    const latencies: Record<string, number> = {
      "socks5://1.1.1.1:1080": 200,
      "socks5://2.2.2.2:1080": 50,
      "socks5://3.3.3.3:1080": 0, // stand-in for unreachable
    };
    const validator = async (proxy: string): Promise<ProxyCheck> =>
      latencies[proxy] ? { proxy, ok: true, latencyMs: latencies[proxy] } : { proxy, ok: false };

    const result = await resolveAutoProxies(target, { providers: ["X"], fetchImpl, validator, max: 5 });
    expect(result).toEqual(["socks5://2.2.2.2:1080", "socks5://1.1.1.1:1080"]);
  });

  it("skips validation when disabled, capping at max", async () => {
    const result = await resolveAutoProxies(target, { providers: ["X"], fetchImpl, validate: false, max: 2 });
    expect(result).toEqual(["socks5://1.1.1.1:1080", "socks5://2.2.2.2:1080"]);
  });

  it("returns nothing when no proxies are fetched", async () => {
    const empty = (async () => ({ ok: true, text: async () => "" })) as unknown as typeof fetch;
    expect(await resolveAutoProxies(target, { providers: ["X"], fetchImpl: empty })).toEqual([]);
  });

  it("falls back to the built-in providers and default limits", async () => {
    // No providers given: exercises DEFAULT_PROVIDERS. It spans socks5/socks4, so the same three
    // IPs come back tagged under both schemes (6 unique).
    const result = await resolveAutoProxies(target, {
      fetchImpl,
      validator: async (proxy) => ({ proxy, ok: true, latencyMs: 1 }),
    });
    expect(result).toHaveLength(6);
    for (const s of ["socks5", "socks4"]) expect(result).toContain(`${s}://1.1.1.1:1080`);
  });

  it("stops probing early once max reachable proxies are found", async () => {
    let calls = 0;
    const validator = async (proxy: string): Promise<ProxyCheck> => {
      calls++;
      return { proxy, ok: true, latencyMs: 1 };
    };
    const result = await resolveAutoProxies(target, {
      fetchImpl: fetchN(50),
      validator,
      max: 2,
      overfetch: 1,
      concurrency: 2,
    });
    expect(result).toHaveLength(2);
    expect(calls).toBeLessThan(50); // did not probe the whole list
  });

  it("over-fetches a buffer of max * overfetch working proxies", async () => {
    let calls = 0;
    const validator = async (proxy: string): Promise<ProxyCheck> => {
      calls++;
      return { proxy, ok: true, latencyMs: 1 };
    };
    const result = await resolveAutoProxies(target, {
      providers: ["X"],
      fetchImpl: fetchN(50),
      validator,
      max: 3,
      overfetch: 2, // keep up to 6
      concurrency: 10,
    });
    expect(result).toHaveLength(6);
    expect(calls).toBeLessThan(50); // stopped once the buffer was full
  });

  it("needs fewer proxies when maxPerProxy is higher", async () => {
    const validator = async (proxy: string): Promise<ProxyCheck> => ({ proxy, ok: true, latencyMs: 1 });
    // ceil(100 / 20) * 2 = 10 proxies for 100 proxied bots at 20 per proxy.
    const result = await resolveAutoProxies(target, {
      providers: ["X"],
      fetchImpl: fetchN(50),
      validator,
      max: 100,
      perProxy: 20,
      overfetch: 2,
      concurrency: 20,
    });
    expect(result).toHaveLength(10);
  });

  it("probes the whole pool when maxProbes is unset", async () => {
    let calls = 0;
    const validator = async (proxy: string): Promise<ProxyCheck> => {
      calls++;
      return { proxy, ok: true, latencyMs: 1 };
    };
    // max never reached, no maxProbes -> every fetched proxy is probed.
    const result = await resolveAutoProxies(target, {
      providers: ["X"],
      fetchImpl: fetchN(50),
      validator,
      max: 999,
    });
    expect(calls).toBe(50);
    expect(result).toHaveLength(50);
  });

  it("caps how many proxies it probes (maxProbes)", async () => {
    let calls = 0;
    const validator = async (proxy: string): Promise<ProxyCheck> => {
      calls++;
      return { proxy, ok: true, latencyMs: 1 };
    };
    const result = await resolveAutoProxies(target, {
      fetchImpl: fetchN(50),
      validator,
      max: 100, // never reached, so early-stop does not interfere
      maxProbes: 3,
      concurrency: 5,
    });
    expect(calls).toBe(3);
    expect(result).toHaveLength(3);
  });

  it("reports progress", async () => {
    const events: { checked: number; total: number; ok: number }[] = [];
    const result = await resolveAutoProxies(target, {
      providers: ["X"], // single provider so the count is exactly fetchN(4)
      fetchImpl: fetchN(4),
      validator: async (proxy) => ({ proxy, ok: true, latencyMs: 1 }),
      max: 100,
      onProgress: (p) => events.push(p),
    });
    expect(events).toHaveLength(4);
    expect(events.at(-1)).toEqual({ checked: 4, total: 4, ok: 4 });
    expect(result).toHaveLength(4);
  });
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, () => 0);
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});
