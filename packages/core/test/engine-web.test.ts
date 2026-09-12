import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the web reporter (real one binds a socket) so the engine's mode:web branch is
// covered without I/O.
const webMock = vi.hoisted(() => ({ fn: vi.fn(() => () => {}) }));
vi.mock("../src/report/web.js", () => ({ startWebReporter: webMock.fn }));

import { configSchema } from "../src/config/schema.js";
import { Engine } from "../src/engine/engine.js";
import { FakeBot } from "./helpers/fakeBot.js";

afterEach(() => vi.useRealTimers());

describe("Engine web reporter", () => {
  it("starts the web reporter on the configured port when report.mode is web", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const config = configSchema.parse({
        authorized: true,
        target: { host: "h" },
        ramp: { count: 1, connectRate: 50, holdSeconds: 0, jitter: 0 },
        report: { json: false, mode: "web", webPort: 9999 },
      });
      const engine = new Engine(config, { skipPreflight: true, driverFactory: (s) => new FakeBot(s) });
      const p = engine.run();
      await vi.advanceTimersByTimeAsync(500);
      await p;
      expect(webMock.fn).toHaveBeenCalled();
      expect(webMock.fn.mock.calls[0]?.[1]).toBe(9999);
    } finally {
      spy.mockRestore();
    }
  });
});
