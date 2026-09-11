import { describe, expect, it } from "vitest";
import {
  dedupeProxies,
  fetchFreeProxies,
  type ProxyCheck,
  parseProxyList,
  pickValidated,
  resolveAutoProxies,
} from "../src/net/autoProxies.js";

describe("parseProxyList", () => {
  it("normalizes bare and schemed lines, skipping junk", () => {
    const text = [
      "# comment",
      "1.2.3.4:1080",
      "socks5://5.6.7.8:1080",
      "http://9.9.9.9:8080",
      "garbage",
      "",
    ].join("\n");
    expect(parseProxyList(text)).toEqual([
      "socks5://1.2.3.4:1080",
      "socks5://5.6.7.8:1080",
      "http://9.9.9.9:8080",
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
  it("keeps reachable proxies fastest-first, capped", () => {
    const checks: ProxyCheck[] = [
      { proxy: "slow", ok: true, latencyMs: 300 },
      { proxy: "dead", ok: false },
      { proxy: "fast", ok: true, latencyMs: 50 },
      { proxy: "mid", ok: true, latencyMs: 100 },
    ];
    expect(pickValidated(checks, 2)).toEqual(["fast", "mid"]);
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
});
