import type { Config } from "../config/schema.js";
import type { Behavior } from "../drivers/driver.js";

/**
 * Sends /register then /login to authenticate on offline-mode auth servers. Fires on every
 * `login` (join to a server), not `spawn`: limbo/auth servers put the bot into play and prompt
 * for the commands without ever sending world data, so `spawn` may never arrive. Firing on each
 * login also re-authenticates after a proxy/Velocity transfer forwards the bot to the real
 * server. A short delay lets the server's login handler be ready. The password is substituted
 * per bot at wire time, not baked into a shared module-scope string.
 */
export function auth(cfg: Config["behaviors"]["auth"]): Behavior {
  const register = cfg.registerCommand.replaceAll("{password}", cfg.password);
  const login = cfg.loginCommand.replaceAll("{password}", cfg.password);
  return (bot) => {
    const timers = new Set<NodeJS.Timeout>();
    const onLogin = () => {
      const t = setTimeout(() => {
        timers.delete(t);
        bot.chat(register); // harmless if already registered ("already registered")
        bot.chat(login);
      }, cfg.delayMs);
      timers.add(t);
    };
    bot.on("login", onLogin);
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  };
}
