/**
 * Estimate server TPS from the clientbound update_time packet's `worldAge`, a
 * monotonic server tick counter. TPS = Δ(worldAge) / Δt_real, clamped to 20.
 * worldAge (not timeOfDay) because time-of-day freezes under `doDaylightCycle false`.
 *
 * Aggregate the per-server estimate across many bots for a stable figure; a single
 * bot's samples are coarse (~1 packet/sec). Proxies (Velocity/Bungee) or Paper/Folia
 * can alter cadence - treat the number as a load trend, not a precise server metric.
 */
export class TpsEstimator {
  private lastAge: bigint | null = null;
  private lastMs = 0;
  private ewma = 20; // optimistic prior until the first real sample locks it
  private primed = false;
  private readonly alpha: number;

  constructor(alpha = 0.3) {
    this.alpha = alpha;
  }

  /** Feed one worldAge sample at wall-clock `nowMs`. Returns the smoothed estimate. */
  record(worldAge: bigint, nowMs: number): number {
    if (this.lastAge !== null) {
      const dTicks = Number(worldAge - this.lastAge);
      const dMs = nowMs - this.lastMs;
      // Ignore non-advancing/backward samples and sub-100ms noise.
      if (dTicks > 0 && dMs >= 100) {
        const instant = Math.min(20, (dTicks / dMs) * 1000);
        // Lock onto the first real measurement instead of blending away the 20 prior.
        this.ewma = this.primed ? this.alpha * instant + (1 - this.alpha) * this.ewma : instant;
        this.primed = true;
      }
    }
    this.lastAge = worldAge;
    this.lastMs = nowMs;
    return this.ewma;
  }

  current(): number {
    return this.ewma;
  }
}
