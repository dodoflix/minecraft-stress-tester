import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/load.js";

let dir: string | undefined;
function tmpFile(name: string, contents: string): string {
  dir = mkdtempSync(join(tmpdir(), "mcst-cfg-"));
  const p = join(dir, name);
  writeFileSync(p, contents);
  return p;
}
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("loadConfig", () => {
  it("parses a new-shape JSON file and applies defaults", () => {
    const p = tmpFile("run.json", JSON.stringify({ authorized: true, target: { host: "x" } }));
    const c = loadConfig(p);
    expect(c.target.host).toBe("x");
    expect(c.target.port).toBe(25565);
    expect(c.driver).toBe("light");
    expect(c.ramp.count).toBe(3);
    expect(c.authorized).toBe(true);
  });

  it("parses a YAML file", () => {
    const p = tmpFile("run.yaml", "authorized: true\ntarget:\n  host: yamlhost\n  port: 1111\n");
    const c = loadConfig(p);
    expect(c.target.host).toBe("yamlhost");
    expect(c.target.port).toBe(1111);
  });

  it("falls back to defaults for an empty config file", () => {
    const c = loadConfig(tmpFile("empty.yaml", ""), { host: "h", authorized: true });
    expect(c.target.host).toBe("h");
    expect(c.target.port).toBe(25565);
  });

  it("CLI flags override the file", () => {
    const p = tmpFile(
      "run.json",
      JSON.stringify({ target: { host: "filehost", port: 100 }, ramp: { count: 1 } }),
    );
    const c = loadConfig(p, { host: "clihost", port: 200, count: 9, authorized: true, version: "1.20.4" });
    expect(c.target.host).toBe("clihost");
    expect(c.target.port).toBe(200);
    expect(c.target.version).toBe("1.20.4");
    expect(c.ramp.count).toBe(9);
    expect(c.authorized).toBe(true);
  });

  it("undefined CLI values do not clobber file values", () => {
    const p = tmpFile("run.json", JSON.stringify({ target: { host: "filehost", port: 100 } }));
    const c = loadConfig(p, { host: undefined, port: undefined });
    expect(c.target.host).toBe("filehost");
    expect(c.target.port).toBe(100);
  });

  it("works with no file, from CLI only", () => {
    const c = loadConfig(undefined, { host: "cli", authorized: true });
    expect(c.target.host).toBe("cli");
    expect(c.authorized).toBe(true);
  });

  it("applies a count override with no file", () => {
    const c = loadConfig(undefined, { host: "cli", count: 5, authorized: true });
    expect(c.ramp.count).toBe(5);
  });

  it("viewDistance defaults to 2 and takes a CLI override", () => {
    expect(loadConfig(undefined, { host: "h", authorized: true }).viewDistance).toBe(2);
    expect(loadConfig(undefined, { host: "h", authorized: true, viewDistance: 8 }).viewDistance).toBe(8);
  });

  it("report defaults: json on, csv/html off, console mode", () => {
    const c = loadConfig(undefined, { host: "h", authorized: true });
    expect(c.report.json).toBe(true);
    expect(c.report.csv).toBe(false);
    expect(c.report.html).toBe(false);
    expect(c.report.mode).toBe("console");
  });

  it("CLI --tui/--csv/--html map onto the report config", () => {
    const c = loadConfig(undefined, { host: "h", authorized: true, tui: true, csv: true, html: true });
    expect(c.report.mode).toBe("tui");
    expect(c.report.csv).toBe(true);
    expect(c.report.html).toBe(true);
  });

  it("CLI --web/--web-port select the web dashboard", () => {
    const c = loadConfig(undefined, { host: "h", authorized: true, web: true, webPort: 9000 });
    expect(c.report.mode).toBe("web");
    expect(c.report.webPort).toBe(9000);
  });

  it("rejects an invalid config (missing host)", () => {
    const p = tmpFile("bad.json", JSON.stringify({ authorized: true, target: { port: 25565 } }));
    expect(() => loadConfig(p)).toThrow();
  });
});
