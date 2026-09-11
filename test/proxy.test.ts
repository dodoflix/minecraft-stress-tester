import { describe, expect, it } from "vitest";
import { type ParsedProxy, ProxyPool, parseProxy } from "../src/net/proxy.js";

describe("parseProxy", () => {
  it("parses a full socks5 URL with credentials", () => {
    expect(parseProxy("socks5://user:pass@1.2.3.4:1080")).toEqual<ParsedProxy>({
      host: "1.2.3.4",
      port: 1080,
      userId: "user",
      password: "pass",
    });
  });
  it("accepts a bare host:port and defaults the port", () => {
    expect(parseProxy("10.0.0.1:9050")).toMatchObject({ host: "10.0.0.1", port: 9050 });
    expect(parseProxy("10.0.0.1")).toMatchObject({ host: "10.0.0.1", port: 1080 });
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
