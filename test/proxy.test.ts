import { describe, expect, it } from "vitest";
import { isLocalHost, type ParsedProxy, ProxyPool, parseProxy } from "../src/net/proxy.js";

describe("isLocalHost", () => {
  it("flags loopback and private ranges, not public hosts", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "::1",
      "10.1.2.3",
      "192.168.0.5",
      "172.16.0.1",
      "172.31.9.9",
    ]) {
      expect(isLocalHost(h)).toBe(true);
    }
    for (const h of ["play.example.com", "1.2.3.4", "172.15.0.1", "172.32.0.1", "8.8.8.8"]) {
      expect(isLocalHost(h)).toBe(false);
    }
  });
});

describe("parseProxy", () => {
  it("parses a full socks5 URL with credentials", () => {
    expect(parseProxy("socks5://user:pass@1.2.3.4:1080")).toEqual<ParsedProxy>({
      scheme: "socks5",
      host: "1.2.3.4",
      port: 1080,
      userId: "user",
      password: "pass",
    });
  });
  it("accepts a bare host:port and defaults scheme + port", () => {
    expect(parseProxy("10.0.0.1:9050")).toMatchObject({ scheme: "socks5", host: "10.0.0.1", port: 9050 });
    expect(parseProxy("10.0.0.1")).toMatchObject({ scheme: "socks5", host: "10.0.0.1", port: 1080 });
  });
  it("recognizes socks4, falls back to socks5 on any other scheme", () => {
    expect(parseProxy("socks4://1.2.3.4:1080").scheme).toBe("socks4");
    expect(parseProxy("http://1.2.3.4:8080").scheme).toBe("socks5"); // http unsupported -> socks5
    expect(parseProxy("ftp://1.2.3.4:21").scheme).toBe("socks5");
  });
});

describe("ProxyPool", () => {
  it("is disabled with an empty list", () => {
    const pool = new ProxyPool([], 5);
    expect(pool.enabled).toBe(false);
    expect(pool.acquire()).toBeUndefined();
  });

  it("hands out round-robin", () => {
    const pool = new ProxyPool(["a", "b", "c"], 10);
    expect([pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()]).toEqual(["a", "b", "c", "a"]);
  });

  it("caps per proxy and returns undefined when all are saturated", () => {
    const pool = new ProxyPool(["a", "b"], 1);
    expect(pool.acquire()).toBe("a");
    expect(pool.acquire()).toBe("b");
    expect(pool.acquire()).toBeUndefined(); // both at cap
    pool.release("a");
    expect(pool.acquire()).toBe("a"); // freed slot reused
  });

  it("release is a no-op for undefined / unknown", () => {
    const pool = new ProxyPool(["a"], 1);
    expect(() => pool.release(undefined)).not.toThrow();
    expect(() => pool.release("z")).not.toThrow();
  });
});
