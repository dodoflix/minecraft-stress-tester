import { describe, expect, it } from "vitest";
import { buildRunConfig } from "../src/config/load.js";

describe("buildRunConfig", () => {
  it("validates a minimal body and applies defaults", () => {
    const r = buildRunConfig({ authorized: true, target: { host: "h" } });
    expect(r.success).toBe(true);
    expect(r.config?.target).toMatchObject({ host: "h", port: 25565 });
    expect(r.config?.ramp.count).toBe(3);
  });

  it("applies a scenario overlay, with the body winning", () => {
    const r = buildRunConfig({ authorized: true, target: { host: "h" }, scenario: "join-flood" });
    expect(r.config?.ramp.count).toBe(500);
    expect(r.config?.driver).toBe("light");
    const overridden = buildRunConfig({
      authorized: true,
      target: { host: "h" },
      scenario: "join-flood",
      ramp: { count: 7 },
    });
    expect(overridden.config?.ramp.count).toBe(7);
  });

  it("ignores an unknown scenario and a non-object body", () => {
    const r = buildRunConfig({ authorized: true, target: { host: "h" }, scenario: "nope" });
    expect(r.success).toBe(true);
    expect((r.config as Record<string, unknown>).scenario).toBeUndefined();
    expect(buildRunConfig(null).success).toBe(false);
  });

  it("reports issues for an invalid config", () => {
    const r = buildRunConfig({ target: { port: 99999 } });
    expect(r.success).toBe(false);
    expect(r.issues?.length).toBeGreaterThan(0);
  });
});
