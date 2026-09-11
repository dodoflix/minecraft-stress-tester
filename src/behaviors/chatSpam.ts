import type { Behavior } from "../drivers/driver.js";
import type { Config } from "../config/schema.js";

export function chatSpam(cfg: Config["behaviors"]["chatSpam"]): Behavior {
  return (bot) => {
    let timer: NodeJS.Timeout | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => bot.chat(cfg.message), cfg.delayMs);
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
