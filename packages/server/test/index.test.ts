import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

describe("server package barrel", () => {
  it("exposes the control-plane surface", () => {
    expect(typeof api.startServer).toBe("function");
    expect(typeof api.handleRequest).toBe("function");
    expect(typeof api.RunManager).toBe("function");
    expect(typeof api.ConfigStore).toBe("function");
    expect(typeof api.listHistory).toBe("function");
  });
});
