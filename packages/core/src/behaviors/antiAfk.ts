import type { Config } from "../config/schema.js";
import type { Behavior } from "../drivers/driver.js";

/**
 * Rotate the head on an interval to avoid no-movement AFK kicks. Needs a driver with
 * `look` (FullBot); a no-op on LightBot, whose keep-alive covers the connection layer.
 */
export function antiAfk(cfg: Config["behaviors"]["antiAfk"]): Behavior {
  return (bot) => {
    if (!bot.look) return () => {};
    let timer: NodeJS.Timeout | null = null;
    let rotated = false;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        bot.look?.(rotated ? 0 : Math.PI, 0);
        rotated = !rotated;
      }, cfg.intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    bot.on("spawned", start);
    bot.on("kicked", stop);
    bot.on("end", stop);
    return stop;
  };
}
