import type { Config } from "../config/schema.js";
import type { Behavior } from "../drivers/driver.js";

/**
 * Run one-shot commands once the bot spawns into the world (e.g. /survival to leave a hub after
 * auth). Fires once per bot, on the first spawn: on a limbo/transfer network the first real spawn
 * is already past auth, so this is effectively "after successful auth". Commands are staggered by
 * delayMs so a server doesn't reject them as too fast.
 */
export function commands(cfg: Config["behaviors"]["commands"]): Behavior {
  return (bot) => {
    let sent = false;
    const timers = new Set<NodeJS.Timeout>();
    const onSpawn = () => {
      if (sent) return; // once per bot, not on every respawn/transfer
      sent = true;
      cfg.list.forEach((command, i) => {
        const t = setTimeout(
          () => {
            timers.delete(t);
            bot.chat(command);
          },
          cfg.delayMs * (i + 1),
        );
        timers.add(t);
      });
    };
    bot.on("spawned", onSpawn);
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  };
}
