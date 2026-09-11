import { describe, expect, it, vi } from "vitest";

// Mock minecraft-protocol's ping so preflight's success path (resolve -> parsePing)
// is covered without a live server, keeping coverage Java-independent.
vi.mock("minecraft-protocol", () => ({
  default: {
    ping: (_opts: unknown, cb: (err: Error | null, res: unknown) => void) =>
      cb(null, {
        description: "hi",
        version: { name: "1.20.4", protocol: 765 },
        players: { online: 4, max: 20 },
        latency: 11,
      }),
  },
}));

import { preflight } from "../src/net/slp.js";

describe("preflight success path", () => {
  it("resolves a parsed result from the ping response", async () => {
    const r = await preflight("example.test", 25565);
    expect(r.versionName).toBe("1.20.4");
    expect(r.protocol).toBe(765);
    expect(r.online).toBe(4);
    expect(r.latencyMs).toBe(11);
  });
});
