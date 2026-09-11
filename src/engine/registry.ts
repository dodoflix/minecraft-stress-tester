import type { BotDriver, BotSpec } from "../drivers/driver.js";

interface Entry {
  bot: BotDriver;
  spec: BotSpec;
  retries: number;
}

/**
 * Owns the live bots and their reconnect bookkeeping. The engine — not the bot —
 * reads specs from here to respawn, so host/port/account are always known. This is
 * the inversion that removes the old circular-require + `undefined:undefined` bug.
 */
export class Registry {
  private readonly bots = new Map<number, Entry>();

  add(bot: BotDriver, spec: BotSpec): void {
    this.bots.set(spec.id, { bot, spec, retries: 0 });
  }

  get(id: number): Entry | undefined {
    return this.bots.get(id);
  }

  replace(id: number, bot: BotDriver): void {
    const e = this.bots.get(id);
    if (e) e.bot = bot;
  }

  incRetry(id: number): number {
    const e = this.bots.get(id);
    if (!e) return Infinity;
    return ++e.retries;
  }

  remove(id: number): void {
    this.bots.delete(id);
  }

  all(): Entry[] {
    return [...this.bots.values()];
  }

  get size(): number {
    return this.bots.size;
  }
}
