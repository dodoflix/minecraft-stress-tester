import type { Config } from "../config/schema.js";

type Ramp = Config["ramp"];

/**
 * Spawn schedule: offset in ms (from run start) for each of `count` bots.
 * Constant `connectRate` spacing, with an optional linear ramp-up where the rate
 * climbs from ~0 to connectRate over `rampUpSeconds`.
 *
 * Deterministic (no jitter here) so it's unit-testable; the engine adds jitter
 * when it actually fires each spawn.
 */
export function buildSpawnSchedule(ramp: Ramp): number[] {
  const { count, connectRate, rampUpSeconds } = ramp;
  const offsets: number[] = [];
  const steadyInterval = 1000 / connectRate; // ms between spawns at full rate

  let t = 0;
  for (let i = 0; i < count; i++) {
    offsets.push(Math.round(t));
    // During ramp-up the effective rate is a fraction of connectRate, so the
    // interval is larger and shrinks toward steadyInterval.
    if (rampUpSeconds > 0 && t < rampUpSeconds * 1000) {
      const frac = Math.max(0.05, t / (rampUpSeconds * 1000)); // avoid divide-by-zero at t=0
      t += steadyInterval / frac;
    } else {
      t += steadyInterval;
    }
  }
  return offsets;
}

/** Total run length: last spawn + hold + ramp-down. */
export function runDurationMs(ramp: Ramp, schedule: number[]): number {
  const lastSpawn = schedule.length ? schedule[schedule.length - 1]! : 0;
  return lastSpawn + (ramp.holdSeconds + ramp.rampDownSeconds) * 1000;
}

/** Apply ±jitter fraction to a delay. */
export function jittered(delayMs: number, jitter: number): number {
  if (jitter <= 0) return delayMs;
  const factor = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(delayMs * factor));
}

/** Exponential backoff with cap and full jitter. */
export function backoffMs(retry: number, base: number, cap: number): number {
  const exp = Math.min(cap, base * 2 ** retry);
  return Math.round(Math.random() * exp);
}
