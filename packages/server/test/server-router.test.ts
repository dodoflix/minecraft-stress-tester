import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MetricsSnapshot } from "minecraft-stress-tester";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/configStore.js";
import { type ApiContext, type ApiRequest, handleRequest } from "../src/router.js";
import { type RunEngine, RunManager } from "../src/runManager.js";

const TOKEN = "secret-token";

function snap(): MetricsSnapshot {
  const h = { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  return {
    elapsedMs: 0,
    attempted: 0,
    connected: 0,
    loggedIn: 0,
    spawned: 0,
    active: 0,
    ended: 0,
    kicked: 0,
    errors: 0,
    connectSuccessRate: 0,
    packetsIn: 0,
    bytesIn: 0,
    packetsPerSec: 0,
    bytesPerSec: 0,
    tps: 20,
    timeToConnectMs: h,
    timeToSpawnMs: h,
    serverPingMs: h,
    kickReasons: {},
  };
}

const pendingEngine = (): RunEngine => ({
  run: () => new Promise<MetricsSnapshot>(() => {}), // stays running
  stop: () => {},
  liveSnapshot: snap,
});

function req(method: string, path: string, extra: Partial<ApiRequest> = {}): ApiRequest {
  return { method, path, query: new URLSearchParams(), token: TOKEN, ...extra };
}

describe("handleRequest", () => {
  let dir: string;
  let ctx: ApiContext;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcst-api-"));
    writeFileSync(
      join(dir, "mcst-2026-09-11T00-00-00-000Z.json"),
      JSON.stringify({
        finishedAt: "2026-09-11T00:00:00.000Z",
        target: { host: "localhost", port: 25565 },
        preflight: null,
        metrics: { spawned: 7, tps: 20 },
      }),
    );
    ctx = {
      runs: new RunManager(pendingEngine),
      configs: new ConfigStore(join(dir, "configs")),
      reportsDir: dir,
      token: TOKEN,
      version: "1.0.0",
    };
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("serves an unauthenticated health probe", () => {
    const r = handleRequest({ ...req("GET", "/api"), token: undefined }, ctx);
    expect(r.status).toBe(200);
    expect((r.body as { version: string }).version).toBe("1.0.0");
  });

  it("rejects a missing or wrong token", () => {
    expect(handleRequest({ ...req("GET", "/api/runs"), token: undefined }, ctx).status).toBe(401);
    expect(handleRequest({ ...req("GET", "/api/runs"), token: "wrong-length" }, ctx).status).toBe(401);
    expect(handleRequest({ ...req("GET", "/api/runs"), token: "xxxxxxxxxxxx" }, ctx).status).toBe(401);
  });

  it("404s a non-api path and an unknown resource", () => {
    expect(handleRequest(req("GET", "/nope"), ctx).status).toBe(404);
    expect(handleRequest(req("GET", "/api/unknown"), ctx).status).toBe(404);
  });

  describe("runs", () => {
    const body = { authorized: true, target: { host: "localhost" } };

    it("starts a run and lists/gets it", () => {
      const created = handleRequest(req("POST", "/api/runs", { body }), ctx);
      expect(created.status).toBe(201);
      const id = (created.body as { id: string }).id;
      expect((handleRequest(req("GET", "/api/runs"), ctx).body as { runs: unknown[] }).runs).toHaveLength(1);
      expect(handleRequest(req("GET", `/api/runs/${id}`), ctx).status).toBe(200);
      expect(handleRequest(req("GET", `/api/runs/${id}/metrics`), ctx).status).toBe(200);
    });

    it("rejects an invalid config and an unauthorized config", () => {
      expect(handleRequest(req("POST", "/api/runs", { body: { target: { port: 99999 } } }), ctx).status).toBe(
        400,
      );
      expect(handleRequest(req("POST", "/api/runs", { body: { target: { host: "h" } } }), ctx).status).toBe(
        400,
      );
    });

    it("stops a run, 404s unknown ids and metrics", () => {
      const id = (handleRequest(req("POST", "/api/runs", { body }), ctx).body as { id: string }).id;
      expect(handleRequest(req("POST", `/api/runs/${id}/stop`), ctx).status).toBe(200);
      expect(handleRequest(req("POST", `/api/runs/${id}/stop`), ctx).status).toBe(404); // already stopped
      expect(handleRequest(req("GET", "/api/runs/ghost"), ctx).status).toBe(404);
      expect(handleRequest(req("GET", "/api/runs/ghost/metrics"), ctx).status).toBe(404);
    });

    it("405s an unsupported method and 404s an unknown sub-route", () => {
      expect(handleRequest(req("DELETE", "/api/runs"), ctx).status).toBe(405);
      expect(handleRequest(req("GET", "/api/runs/x/bogus"), ctx).status).toBe(404);
    });
  });

  describe("configs", () => {
    const yaml = "authorized: true\ntarget:\n  host: localhost\n";

    it("validates without persisting", () => {
      const r = handleRequest(req("POST", "/api/configs/validate", { body: { content: yaml } }), ctx);
      expect(r.status).toBe(200);
      expect((r.body as { valid: boolean }).valid).toBe(true);
    });

    it("puts, lists, gets and deletes a config", () => {
      expect(
        handleRequest(req("PUT", "/api/configs/run.yaml", { body: { content: yaml } }), ctx).status,
      ).toBe(200);
      expect((handleRequest(req("GET", "/api/configs"), ctx).body as { configs: string[] }).configs).toEqual([
        "run.yaml",
      ]);
      expect(handleRequest(req("GET", "/api/configs/run.yaml"), ctx).status).toBe(200);
      expect(handleRequest(req("DELETE", "/api/configs/run.yaml"), ctx).status).toBe(200);
      expect(handleRequest(req("DELETE", "/api/configs/run.yaml"), ctx).status).toBe(404);
    });

    it("400s an invalid put, 404s a missing get, 405s a bad method", () => {
      expect(
        handleRequest(
          req("PUT", "/api/configs/bad.yaml", { body: { content: "target:\n  port: 99999\n" } }),
          ctx,
        ).status,
      ).toBe(400);
      expect(handleRequest(req("GET", "/api/configs/missing.yaml"), ctx).status).toBe(404);
      expect(handleRequest(req("POST", "/api/configs"), ctx).status).toBe(405);
      expect(handleRequest(req("PATCH", "/api/configs/run.yaml"), ctx).status).toBe(405);
    });
  });

  describe("history", () => {
    it("lists and reads reports, 404s a missing one, 405s a bad method", () => {
      const list = handleRequest(req("GET", "/api/history"), ctx);
      expect((list.body as { history: unknown[] }).history).toHaveLength(1);
      expect(handleRequest(req("GET", "/api/history/mcst-2026-09-11T00-00-00-000Z.json"), ctx).status).toBe(
        200,
      );
      expect(handleRequest(req("GET", "/api/history/mcst-missing.json"), ctx).status).toBe(404);
      expect(handleRequest(req("POST", "/api/history"), ctx).status).toBe(405);
    });
  });
});
