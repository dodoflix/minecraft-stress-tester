import { describe, expect, it } from "vitest";
import { parsePing, preflight } from "../src/net/slp.js";

describe("preflight", () => {
  it("rejects with a clear message for an unreachable target", async () => {
    await expect(preflight("127.0.0.1", 1)).rejects.toThrow(/cannot reach 127\.0\.0\.1:1/);
  });
});

describe("parsePing", () => {
  it("reads a full modern status response", () => {
    const r = parsePing({
      description: { text: "Welcome" },
      version: { name: "Paper 1.21.8", protocol: 772 },
      players: { online: 12, max: 100 },
      latency: 23,
    });
    expect(r).toEqual({
      motd: "Welcome",
      versionName: "Paper 1.21.8",
      protocol: 772,
      online: 12,
      max: 100,
      latencyMs: 23,
    });
  });

  it("accepts a legacy string description", () => {
    expect(parsePing({ description: "A Minecraft Server" }).motd).toBe("A Minecraft Server");
  });

  it("flattens text + extra components", () => {
    const r = parsePing({ description: { text: "Hi ", extra: [{ text: "there" }, { text: "!" }] } });
    expect(r.motd).toBe("Hi there!");
  });

  it("strips section-sign color codes", () => {
    expect(parsePing({ description: "§aGreen§r plain" }).motd).toBe("Green plain");
  });

  it("ignores a non-array extra field", () => {
    expect(parsePing({ description: { text: "x", extra: "not-an-array" } }).motd).toBe("x");
  });

  it("fills defaults for a missing/garbage response", () => {
    const r = parsePing({});
    expect(r.versionName).toBe("unknown");
    expect(r.protocol).toBe(0);
    expect(r.online).toBe(0);
    expect(r.max).toBe(0);
    expect(r.latencyMs).toBe(0);
  });
});
