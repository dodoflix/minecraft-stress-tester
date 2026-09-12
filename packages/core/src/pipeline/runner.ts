import type { BotDriver } from "../drivers/driver.js";
import type { Stage, StageContext, StageHandle, StageResult } from "./stage.js";

export type FailurePolicy = "stop" | "continue" | "retry";

export interface ResolvedStage {
  kind: string;
  stage: Stage;
  onFailure: FailurePolicy;
  retries: number;
  timeoutMs?: number;
}

export interface PipelineHandle {
  stop: () => void;
  /** Resolves when the pipeline stops advancing (all stages started, gated, or a stop policy hit). */
  finished: Promise<void>;
}

function withTimeout(done: Promise<StageResult>, timeoutMs?: number): Promise<StageResult> {
  // A stage that rejects counts as a failed stage, never an unhandled rejection.
  const safe = done.then(
    (r) => r,
    (): StageResult => ({ status: "failed", reason: "stage error" }),
  );
  if (!timeoutMs || timeoutMs <= 0) return safe;
  return new Promise<StageResult>((resolve) => {
    const timer = setTimeout(() => resolve({ status: "failed", reason: "timeout" }), timeoutMs);
    safe.then((r) => {
      clearTimeout(timer);
      resolve(r);
    });
  });
}

/**
 * Run a per-bot pipeline: stages in order, each gating the next on a non-failure result. On failure
 * a stage's policy decides (stop the pipeline, continue to the next, or retry up to `retries`).
 * Daemon stages resolve as soon as they start and keep running; everything is torn down when the
 * bot ends/kicks or `stop()` is called. The sequencing is pure logic (unit-tested with fake stages).
 */
export function runPipeline(bot: BotDriver, stages: ResolvedStage[]): PipelineHandle {
  let spawned = false;
  let stopped = false;
  const handles = new Set<StageHandle>();
  const ctx: StageContext = { spawned: () => spawned };

  const onSpawned = () => {
    spawned = true;
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    bot.off("spawned", onSpawned);
    bot.off("end", stop);
    bot.off("kicked", stop);
    for (const h of handles) h.stop();
  };
  bot.on("spawned", onSpawned);
  bot.on("end", stop);
  bot.on("kicked", stop);

  const finished = (async () => {
    for (const rs of stages) {
      if (stopped) return;
      let attempt = 0;
      for (;;) {
        const handle = rs.stage(bot, ctx);
        handles.add(handle);
        const result = await withTimeout(handle.done, rs.timeoutMs);
        if (result.status !== "failed") break; // succeeded or done -> next stage
        if (rs.onFailure === "retry" && attempt < rs.retries) {
          attempt++;
          handle.stop();
          handles.delete(handle);
          continue;
        }
        if (rs.onFailure === "stop") return;
        handle.stop(); // continue: drop the failed stage, move on
        handles.delete(handle);
        break;
      }
    }
  })();
  finished.catch(() => {});

  return { stop, finished };
}
