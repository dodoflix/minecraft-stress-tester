import type { Config } from "../config/schema.js";
import type { Behavior } from "../drivers/driver.js";

/**
 * Random walk: look somewhere, hold forward, occasionally jump. Forces chunk loads and
 * generates realistic movement/physics load. Needs a driver with movement (FullBot);
 * no-op on LightBot.
 */
export function movement(cfg: Config["behaviors"]["movement"]): Behavior {
  return (bot) => {
    if (!bot.setControlState || !bot.look) return () => {};
    let timer: NodeJS.Timeout | null = null;
    const step = () => {
      bot.look?.(Math.random() * Math.PI * 2, 0);
      bot.setControlState?.("forward", true);
      bot.setControlState?.("jump", Math.random() < 0.3);
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(step, cfg.intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      bot.setControlState?.("forward", false);
    };
    bot.on("spawned", start);
    bot.on("kicked", stop);
    bot.on("end", stop);
    return stop;
  };
}
