import { describe, expect, it } from "vitest";
import { configFormFields, configJsonSchema } from "../src/config/formSchema.js";

const fields = configFormFields();
const byPath = (p: string) => fields.find((f) => f.path === p);

describe("configJsonSchema", () => {
  it("is derived from the zod config schema", () => {
    const js = configJsonSchema();
    expect(js.type).toBe("object");
    expect(js.properties?.target?.type).toBe("object");
    expect(js.required).toContain("target");
  });
});

describe("configFormFields", () => {
  it("marks target.host as a required string with no default", () => {
    const host = byPath("target.host");
    expect(host).toMatchObject({ kind: "string", required: true, group: "target" });
    expect(host?.default).toBeUndefined();
  });

  it("surfaces numeric bounds and defaults", () => {
    expect(byPath("target.port")).toMatchObject({ kind: "integer", default: 25565, min: 1, max: 65535 });
    // Count's zod z.int() upper bound is MAX_SAFE_INTEGER, which is not a real UI limit.
    const count = byPath("ramp.count");
    expect(count).toMatchObject({ kind: "integer", default: 3, min: 1 });
    expect(count?.max).toBeUndefined();
  });

  it("represents enums with their options", () => {
    expect(byPath("driver")).toMatchObject({
      kind: "enum",
      options: ["light", "full"],
      default: "light",
      group: "general",
    });
    expect(byPath("report.mode")?.options).toEqual(["console", "tui", "web"]);
  });

  it("represents booleans and string arrays", () => {
    expect(byPath("authorized")).toMatchObject({ kind: "boolean", default: false, group: "general" });
    expect(byPath("proxies.list")).toMatchObject({ kind: "string[]", group: "proxies" });
    expect(byPath("proxies.list")?.default).toEqual([]);
  });

  it("uses the top-level section as the group", () => {
    expect(byPath("reconnect.maxRetries")).toMatchObject({ kind: "integer", group: "reconnect" });
  });

  it("humanizes labels and never leaks the sentinel max", () => {
    expect(byPath("ramp.connectRate")?.label).toBe("Connect Rate");
    expect(fields.every((f) => f.max === undefined || f.max < Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});
