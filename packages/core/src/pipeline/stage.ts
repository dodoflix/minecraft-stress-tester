import type { BotDriver } from "../drivers/driver.js";

/**
 * A stage is one composable unit of bot behavior. It reports a completion signal so the pipeline
 * runner can sequence stages and gate each on the previous one's success:
 * - `succeeded`: the stage did its job (advance to the next stage).
 * - `done`: the stage finished with nothing to gate on, e.g. a no-op (also advances).
 * - `failed`: the stage failed (the runner applies the stage's failure policy).
 * "Daemon" stages (chat spam, anti-afk, movement) resolve as soon as they start and keep running
 * until `stop()`; "gating" stages (auth, commands, a blueprint) resolve when their work completes.
 */
export type StageStatus = "succeeded" | "failed" | "done";

export interface StageResult {
  status: StageStatus;
  reason?: string;
}

export interface StageHandle {
  /** Resolves once, when the stage completes; the runner awaits this to gate the next stage. */
  done: Promise<StageResult>;
  /** Tear the stage down (clear timers, remove listeners). Safe to call more than once. */
  stop: () => void;
}

/** Shared per-bot state the runner exposes to stages (e.g. whether the bot has spawned yet). */
export interface StageContext {
  spawned: () => boolean;
}

export type Stage = (bot: BotDriver, ctx: StageContext) => StageHandle;
