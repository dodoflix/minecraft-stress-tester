import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the SLP preflight so the engine's real preflight path (ping + log + version
// negotiation) is exercised without a network / Java, keeping coverage Java-independent.
const preflightMock = vi.hoisted(() => ({
  fn: vi.fn(async () => ({
    motd: "test motd",
    versionName: "1.20.4",
    protocol: 765,
    online: 3,
    max: 20,
    latencyMs: 7,
  })),
}));
vi.mock("../src/net/slp.js", () => ({ preflight: preflightMock.fn }));

import { Engine } from "../src/engine/engine.js";
import { configSchema } from "../src/config/schema.js";
import { FakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

describe("Engine with preflight enabled", () => {
  it("pings the target, logs it, then spawns", async () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const config = configSchema.parse({
        authorized: true,
        target: { host: "example.test", port: 25565 },
        ramp: { count: 1, connectRate: 50, holdSeconds: 0, jitter: 0 },
        report: { json: false },
      });
      const engine = new Engine(config, { driverFactory: (s) => new FakeBot(s) }); // preflight NOT skipped

      const p = engine.run();
      await vi.advanceTimersByTimeAsync(500);
      const snap = await p;

      expect(preflightMock.fn).toHaveBeenCalledWith("example.test", 25565, undefined);
      const out = writeSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(out).toContain("Preflight ping example.test:25565");
      expect(out).toContain("1.20.4 (protocol 765)");
      expect(snap.attempted).toBe(1);
    } finally {
      writeSpy.mockRestore();
    }
  });
});
