import type { Config } from "../config/schema.js";
import { Engine } from "../engine/engine.js";
import type { MetricsSnapshot } from "../metrics/collector.js";

export type RunStatus = "running" | "completed" | "failed" | "stopped";

/** The slice of Engine the run manager drives. Lets tests inject a fake. */
export interface RunEngine {
  run(): Promise<MetricsSnapshot>;
  stop(reason?: string): void;
  liveSnapshot(): MetricsSnapshot;
}

export type EngineFactory = (config: Config) => RunEngine;

export interface RunRecord {
  id: string;
  status: RunStatus;
  target: { host: string; port: number };
  count: number;
  driver: Config["driver"];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

interface Live {
  record: RunRecord;
  engine: RunEngine;
  final?: MetricsSnapshot;
}

const defaultFactory: EngineFactory = (config) => new Engine(config, { quiet: true });

/**
 * Owns the set of in-process runs the API starts. Each run is an Engine driven quietly;
 * the manager tracks status and exposes live/final snapshots. Pure orchestration (no I/O
 * of its own), so it's unit-testable with a fake engine factory.
 */
export class RunManager {
  private readonly runs = new Map<string, Live>();
  private seq = 0;

  constructor(private readonly factory: EngineFactory = defaultFactory) {}

  start(config: Config): RunRecord {
    const id = `run-${Date.now()}-${++this.seq}`;
    const engine = this.factory(config);
    const record: RunRecord = {
      id,
      status: "running",
      target: { host: config.target.host, port: config.target.port },
      count: config.ramp.count,
      driver: config.driver,
      startedAt: new Date().toISOString(),
    };
    const live: Live = { record, engine };
    this.runs.set(id, live);

    engine
      .run()
      .then((snapshot) => {
        live.final = snapshot;
        // A stop() resolves the run too; don't overwrite the "stopped" status.
        if (record.status === "running") record.status = "completed";
        record.finishedAt = new Date().toISOString();
      })
      .catch((err: unknown) => {
        record.status = "failed";
        record.error = err instanceof Error ? err.message : String(err);
        record.finishedAt = new Date().toISOString();
      });

    return record;
  }

  list(): RunRecord[] {
    return [...this.runs.values()].map((l) => l.record);
  }

  get(id: string): RunRecord | undefined {
    return this.runs.get(id)?.record;
  }

  /** Live snapshot while running, or the captured final snapshot once done. */
  snapshot(id: string): MetricsSnapshot | undefined {
    const live = this.runs.get(id);
    if (!live) return undefined;
    return live.record.status === "running" ? live.engine.liveSnapshot() : live.final;
  }

  /** Request an early stop. Returns false if the id is unknown or already finished. */
  stop(id: string, reason = "stopped via API"): boolean {
    const live = this.runs.get(id);
    if (!live) return false;
    if (live.record.status !== "running") return false;
    live.record.status = "stopped";
    live.record.finishedAt = new Date().toISOString();
    live.engine.stop(reason);
    return true;
  }
}
