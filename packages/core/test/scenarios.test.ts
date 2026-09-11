import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/load.js";
import { applyScenario } from "../src/config/scenarios.js";

describe("applyScenario", () => {
  it("returns the expected overlay per name", () => {
    expect(applyScenario("join-flood")).toMatchObject({ driver: "light", reconnect: { enabled: false } });
    expect(applyScenario("chunk-thrash")).toMatchObject({ driver: "full", viewDistance: 8 });
    expect(applyScenario("chat-flood")).toMatchObject({ behaviors: { chatSpam: { enabled: true } } });
  });
});

describe("loadConfig with scenarios", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  const file = (body: string) => {
    dir = mkdtempSync(join(tmpdir(), "mcst-scn-"));
    const p = join(dir, "run.json");
    writeFileSync(p, body);
    return p;
  };

  it("CLI scenario seeds ramp/driver, overridden by explicit CLI flags", () => {
    const c = loadConfig(undefined, { host: "h", authorized: true, scenario: "join-flood", count: 7 });
    expect(c.driver).toBe("light");
    expect(c.reconnect.enabled).toBe(false);
    expect(c.ramp.connectRate).toBe(50); // from scenario
    expect(c.ramp.count).toBe(7); // CLI overrides the scenario's count
  });

  it("a config file overrides the scenario, deep-merging nested blocks", () => {
    const p = file(JSON.stringify({ scenario: "chunk-thrash", ramp: { count: 3 } }));
    const c = loadConfig(p, { host: "h", authorized: true });
    expect(c.driver).toBe("full"); // from scenario
    expect(c.behaviors.movement.enabled).toBe(true); // from scenario
    expect(c.ramp.count).toBe(3); // file overrides scenario's count
    expect(c.ramp.holdSeconds).toBe(120); // scenario value preserved by deep merge
  });
});

describe("proxies + accounts config defaults", () => {
  it("defaults are empty pool and offline accounts", () => {
    const c = loadConfig(undefined, { host: "h", authorized: true });
    expect(c.proxies.list).toEqual([]);
    expect(c.proxies.maxPerProxy).toBe(50);
    expect(c.accounts.mode).toBe("offline");
    expect(c.accounts.microsoftAccounts).toEqual([]);
  });
});
