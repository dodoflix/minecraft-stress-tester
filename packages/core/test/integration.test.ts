import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configSchema } from "../src/config/schema.js";
import { Engine } from "../src/engine/engine.js";
import { javaAvailable, type RealServer, startRealServer } from "./helpers/realServer.js";

// Runs against a REAL, latest-version Paper server (downloaded + cached on first run).
// Skips only when Java is absent so contributors without a JDK still get a green suite;
// CI installs Java so this always runs there.
const hasJava = javaAvailable();

describe.skipIf(!hasJava)("integration: bots vs a real Paper server", () => {
  let server: RealServer;

  beforeAll(async () => {
    server = await startRealServer();
    console.log(`real server up: Paper ${server.version} on :${server.port}`);
  }, 360000); // jar download + cold Paper boot

  afterAll(async () => {
    await server?.close();
  });

  it("connects, spawns, and reads a healthy ~20 TPS from an idle server", async () => {
    const config = configSchema.parse({
      authorized: true,
      target: { host: "127.0.0.1", port: server.port }, // auto-detect version from ping
      ramp: { count: 5, connectRate: 5, holdSeconds: 8, jitter: 0 },
      report: { json: false },
    });

    const snap = await new Engine(config, { quiet: true }).run();

    expect(snap.attempted).toBe(5);
    expect(snap.spawned).toBe(5);
    expect(snap.connectSuccessRate).toBe(1);
    expect(snap.timeToConnectMs.count).toBe(5);
    expect(snap.errors).toBe(0);
    // An idle flat server should tick at full speed.
    expect(snap.tps).toBeGreaterThan(18);
    expect(snap.tps).toBeLessThanOrEqual(20);
  }, 60000);

  it("FullBot (mineflayer) connects, spawns, and moves", async () => {
    const config = configSchema.parse({
      authorized: true,
      target: { host: "127.0.0.1", port: server.port },
      driver: "full",
      ramp: { count: 2, connectRate: 2, holdSeconds: 6, jitter: 0 },
      behaviors: { antiAfk: { enabled: true }, movement: { enabled: true } },
      report: { json: false },
    });

    const snap = await new Engine(config, { quiet: true }).run();

    expect(snap.spawned).toBe(2);
    expect(snap.connectSuccessRate).toBe(1);
    expect(snap.errors).toBe(0);
  }, 60000);
});
