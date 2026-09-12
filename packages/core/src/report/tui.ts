import type { MetricsCollector } from "../metrics/collector.js";
import { type DashboardContext, renderDashboard } from "./dashboard.js";

const CLEAR = "\x1b[2J\x1b[H"; // clear screen + home cursor
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

/**
 * Full-screen live dashboard: redraws the rendered string each tick. Dependency-free
 * (raw ANSI). The render itself lives in dashboard.ts and is unit-tested; this file is
 * the terminal I/O loop and is excluded from coverage.
 */
export function startTuiReporter(
  collector: MetricsCollector,
  ctx: DashboardContext,
  intervalMs = 500,
): () => void {
  process.stdout.write(HIDE_CURSOR);
  const draw = () => process.stdout.write(`${CLEAR}${renderDashboard(collector.snapshot(), ctx)}\n`);
  draw();
  const timer = setInterval(draw, intervalMs);
  return () => {
    clearInterval(timer);
    process.stdout.write(`${SHOW_CURSOR}\n`);
  };
}
