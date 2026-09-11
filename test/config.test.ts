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

  it("migrates the legacy flat config.json shape", () => {
    const legacy = {
      host: "legacy",
      port: "25566",
      count: 7,
      prefix: "old",
      authenticationEnabled: true,
      password: "pw",
      loginCommand: "/login {password}",
      registerCommand: "/reg {password} {password}",
      chatSpamEnabled: true,
      chatSpamMessage: "spam",
      chatSpamDelay: 500,
      antiAfkEnabled: false,
    };
    const c = loadConfig(tmpFile("config.json", JSON.stringify(legacy)));
    expect(c.target.host).toBe("legacy");
    expect(c.target.port).toBe(25566);
    expect(c.ramp.count).toBe(7);
    expect(c.accounts.usernamePrefix).toBe("old");
    expect(c.behaviors.auth.enabled).toBe(true);
    expect(c.behaviors.auth.password).toBe("pw");
    expect(c.behaviors.chatSpam.enabled).toBe(true);
    expect(c.behaviors.chatSpam.message).toBe("spam");
    expect(c.behaviors.chatSpam.delayMs).toBe(500);
    expect(c.behaviors.antiAfk.enabled).toBe(false);
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

  it("rejects an invalid config (missing host)", () => {
    const p = tmpFile("bad.json", JSON.stringify({ authorized: true, target: { port: 25565 } }));
    expect(() => loadConfig(p)).toThrow();
  });
});
