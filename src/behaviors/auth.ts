import type { Config } from "../config/schema.js";
import type { Behavior } from "../drivers/driver.js";

/**
 * Sends /register then /login on spawn (offline-mode auth plugins). Ported from the
 * old authentication.js, but the password is substituted per-bot at wire time, not
 * baked into a shared module-scope string.
 */
export function auth(cfg: Config["behaviors"]["auth"]): Behavior {
  const register = cfg.registerCommand.replaceAll("{password}", cfg.password);
  const login = cfg.loginCommand.replaceAll("{password}", cfg.password);
  return (bot) => {
    const onSpawn = () => {
      bot.chat(register);
      bot.chat(login);
    };
    bot.on("spawned", onSpawn);
    return () => {};
  };
}
