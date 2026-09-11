import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigStore, isSafeConfigName, validateConfig } from "../src/server/configStore.js";

const VALID_YAML = "authorized: true\ntarget:\n  host: localhost\n";

describe("validateConfig", () => {
  it("accepts valid yaml and returns the defaulted config", () => {
    const r = validateConfig(VALID_YAML);
    expect(r.valid).toBe(true);
    expect(r.config?.target.host).toBe("localhost");
    expect(r.config?.target.port).toBe(25565); // schema default applied
  });

  it("accepts valid json", () => {
    const r = validateConfig(JSON.stringify({ target: { host: "h" } }), ".json");
    expect(r.valid).toBe(true);
  });

  it("treats empty yaml as {} (schema error, not a parse error)", () => {
    const r = validateConfig("");
    expect(r.valid).toBe(false);
    expect(r.errors?.some((e) => e.includes("target"))).toBe(true);
    expect(r.errors?.some((e) => e.includes("parse error"))).toBe(false);
  });

  it("reports schema errors with field paths", () => {
    const r = validateConfig("target:\n  port: 99999\n");
    expect(r.valid).toBe(false);
    expect(r.errors?.some((e) => e.includes("target.port"))).toBe(true);
  });

  it("reports a parse error for malformed json", () => {
    const r = validateConfig("{not json", ".json");
    expect(r.valid).toBe(false);
    expect(r.errors?.[0]).toMatch(/parse error/);
  });
});

describe("isSafeConfigName", () => {
  it("allows plain yaml/json names, rejects traversal and odd extensions", () => {
    expect(isSafeConfigName("run.yaml")).toBe(true);
    expect(isSafeConfigName("a.yml")).toBe(true);
    expect(isSafeConfigName("a.json")).toBe(true);
    expect(isSafeConfigName("../evil.yaml")).toBe(false);
    expect(isSafeConfigName("nope.txt")).toBe(false);
    expect(isSafeConfigName("a/b.yaml")).toBe(false);
  });
});

describe("ConfigStore", () => {
  let dir: string;
  let store: ConfigStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcst-cfg-"));
    store = new ConfigStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes a valid config and reads it back", () => {
    expect(store.write("run.yaml", VALID_YAML).valid).toBe(true);
    expect(store.read("run.yaml")).toBe(VALID_YAML);
    expect(readFileSync(join(dir, "run.yaml"), "utf8")).toBe(VALID_YAML);
  });

  it("refuses an invalid name without writing", () => {
    const r = store.write("../evil.yaml", VALID_YAML);
    expect(r.valid).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("refuses invalid content without writing", () => {
    expect(store.write("bad.yaml", "target:\n  port: 99999\n").valid).toBe(false);
    expect(store.read("bad.yaml")).toBeUndefined();
  });

  it("lists only safe names, sorted", () => {
    store.write("b.yaml", VALID_YAML);
    store.write("a.yaml", VALID_YAML);
    expect(store.list()).toEqual(["a.yaml", "b.yaml"]);
  });

  it("returns undefined reading a missing or unsafe name", () => {
    expect(store.read("missing.yaml")).toBeUndefined();
    expect(store.read("../x.yaml")).toBeUndefined();
  });

  it("deletes an existing config, reports false otherwise", () => {
    store.write("run.yaml", VALID_YAML);
    expect(store.delete("run.yaml")).toBe(true);
    expect(store.delete("run.yaml")).toBe(false);
    expect(store.delete("../x.yaml")).toBe(false);
  });

  it("lists nothing when the directory does not exist yet", () => {
    expect(new ConfigStore(join(dir, "nope")).list()).toEqual([]);
  });
});
