import type { BotApiEventMap, DebugBot } from "../bot/botApi.js";
import type { StageResult } from "../pipeline/stage.js";
import type { Action, Blueprint } from "./blueprint.js";

/** A bot that can both act (DebugBot) and be subscribed to (events), i.e. a live BotApi. */
export type ScriptableBot = DebugBot & {
  on<E extends keyof BotApiEventMap>(event: E, listener: (...args: BotApiEventMap[E]) => void): unknown;
};

export type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Bot API subset an action sequence actually drives (no world queries). */
export type ActionBot = Pick<DebugBot, "chat" | "command" | "look" | "goto" | "stop">;

/**
 * Execute one action sequence against the Bot API, in order. No eval: each action maps to a
 * fixed Bot API call. Sleep is injectable so `wait` is testable without real timers. Pure
 * aside from the injected bot/sleep.
 */
export async function runActions(
  actions: Action[],
  bot: ActionBot,
  sleep: Sleep = defaultSleep,
): Promise<StageResult> {
  for (const a of actions) {
    switch (a.type) {
      case "chat":
        bot.chat(a.message);
        break;
      case "command":
        bot.command(a.command);
        break;
      case "look":
        await bot.look(a.yaw, a.pitch);
        break;
      case "goto":
        await bot.goto(a.x, a.y, a.z);
        break;
      case "wait":
        await sleep(a.ms);
        break;
      case "stop":
        bot.stop();
        break;
      case "succeed":
        return { status: "succeeded" };
      case "fail":
        return { status: "failed", reason: a.reason };
    }
  }
  return { status: "done" };
}

/**
 * Wire a blueprint to a live bot: run its `spawn` rules now (the bot is already spawned when
 * we attach), and subscribe `chat`/`death` rules to the bot's events. Safe by construction:
 * the blueprint only selects vetted actions, so no user code runs.
 */
export function runBlueprint(blueprint: Blueprint, bot: ScriptableBot, sleep: Sleep = defaultSleep): void {
  for (const rule of blueprint.rules) {
    if (rule.on === "spawn") {
      void runActions(rule.actions, bot, sleep);
    } else if (rule.on === "chat") {
      bot.on("chat", () => void runActions(rule.actions, bot, sleep));
    } else {
      bot.on("death", () => void runActions(rule.actions, bot, sleep));
    }
  }
}
