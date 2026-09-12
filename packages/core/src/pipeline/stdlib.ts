import type {
  AntiAfkOptions,
  AuthOptions,
  BlueprintStageOptions,
  ChatSpamOptions,
  CommandsOptions,
  Config,
  MovementOptions,
  PipelineStage,
} from "../config/schema.js";
import type { BotDriver } from "../drivers/driver.js";
import { type ActionBot, runActions } from "../script/run.js";
import type { ResolvedStage } from "./runner.js";
import type { Stage, StageContext, StageResult } from "./stage.js";

// Run `fn` when the bot spawns; run it immediately if it already has. Returns an unsubscribe.
function onSpawn(bot: BotDriver, ctx: StageContext, fn: () => void): () => void {
  if (ctx.spawned()) {
    fn();
    return () => {};
  }
  bot.on("spawned", fn);
  return () => bot.off("spawned", fn);
}

const succeeded: StageResult = { status: "succeeded" };

// Sends /register then /login after a short delay on each join. Resolves after the first send so
// later stages (e.g. chat spam) only start once auth has run.
function authStage(o: AuthOptions): Stage {
  const register = o.registerCommand.replaceAll("{password}", o.password);
  const login = o.loginCommand.replaceAll("{password}", o.password);
  return (bot) => {
    const timers = new Set<NodeJS.Timeout>();
    let resolve!: (r: StageResult) => void;
    const done = new Promise<StageResult>((r) => (resolve = r));
    let resolved = false;
    const onLogin = () => {
      const t = setTimeout(() => {
        timers.delete(t);
        bot.chat(register);
        bot.chat(login);
        if (!resolved) {
          resolved = true;
          resolve(succeeded);
        }
      }, o.delayMs);
      timers.add(t);
    };
    bot.on("login", onLogin);
    return {
      done,
      stop: () => {
        bot.off("login", onLogin);
        for (const t of timers) clearTimeout(t);
        timers.clear();
      },
    };
  };
}

// Run one-shot commands once, staggered, on the first spawn. Resolves after the last.
function commandsStage(o: CommandsOptions): Stage {
  return (bot, ctx) => {
    if (o.list.length === 0) return { done: Promise.resolve({ status: "done" }), stop: () => {} };
    const timers = new Set<NodeJS.Timeout>();
    let resolve!: (r: StageResult) => void;
    const done = new Promise<StageResult>((r) => (resolve = r));
    let sent = false;
    const run = () => {
      if (sent) return;
      sent = true;
      o.list.forEach((command, i) => {
        const t = setTimeout(
          () => {
            timers.delete(t);
            bot.chat(command);
            if (i === o.list.length - 1) resolve(succeeded);
          },
          o.delayMs * (i + 1),
        );
        timers.add(t);
      });
    };
    const off = onSpawn(bot, ctx, run);
    return {
      done,
      stop: () => {
        off();
        for (const t of timers) clearTimeout(t);
        timers.clear();
      },
    };
  };
}

// Daemon: send a chat message on an interval, starting at spawn. Advances the pipeline immediately.
function chatSpamStage(o: ChatSpamOptions): Stage {
  return (bot, ctx) => {
    let timer: NodeJS.Timeout | null = null;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      timer = setInterval(() => bot.chat(o.message), o.delayMs);
    };
    const off = onSpawn(bot, ctx, start);
    return {
      done: Promise.resolve(succeeded),
      stop: () => {
        off();
        if (timer) clearInterval(timer);
        timer = null;
      },
    };
  };
}

// Daemon: rotate the head to avoid AFK kicks (FullBot only; a no-op elsewhere).
function antiAfkStage(o: AntiAfkOptions): Stage {
  return (bot, ctx) => {
    const look = bot.look;
    if (!look) return { done: Promise.resolve({ status: "done" }), stop: () => {} };
    let timer: NodeJS.Timeout | null = null;
    let rotated = false;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      timer = setInterval(() => {
        look.call(bot, rotated ? 0 : Math.PI, 0);
        rotated = !rotated;
      }, o.intervalMs);
    };
    const off = onSpawn(bot, ctx, start);
    return {
      done: Promise.resolve(succeeded),
      stop: () => {
        off();
        if (timer) clearInterval(timer);
        timer = null;
      },
    };
  };
}

// Daemon: random walk to churn chunks and physics (FullBot only; a no-op elsewhere).
function movementStage(o: MovementOptions): Stage {
  return (bot, ctx) => {
    const look = bot.look;
    const setControl = bot.setControlState;
    if (!setControl || !look) return { done: Promise.resolve({ status: "done" }), stop: () => {} };
    let timer: NodeJS.Timeout | null = null;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      timer = setInterval(() => {
        look.call(bot, Math.random() * Math.PI * 2, 0);
        setControl.call(bot, "forward", true);
        setControl.call(bot, "jump", Math.random() < 0.3);
      }, o.intervalMs);
    };
    const off = onSpawn(bot, ctx, start);
    return {
      done: Promise.resolve(succeeded),
      stop: () => {
        off();
        if (timer) clearInterval(timer);
        timer = null;
        setControl.call(bot, "forward", false);
      },
    };
  };
}

// Adapt a scale driver to the action subset a blueprint drives. Pathfinding needs a full client,
// so goto is inert here (world queries are not part of the action surface at all).
function driverAsActionBot(bot: BotDriver): ActionBot {
  return {
    chat: (m) => bot.chat(m),
    command: (c) => bot.chat(c.startsWith("/") ? c : `/${c}`),
    look: async (yaw, pitch) => {
      bot.look?.(yaw, pitch);
    },
    goto: async () => {},
    stop: () => bot.setControlState?.("forward", false),
  };
}

// Run a blueprint's spawn rules as a gating stage over a scale driver, reporting its completion
// signal. (chat/death rules need a full client's events and are handled by the debug/scripting path.)
function blueprintStage(o: BlueprintStageOptions): Stage {
  return (bot, ctx) => {
    let resolve!: (r: StageResult) => void;
    const done = new Promise<StageResult>((r) => (resolve = r));
    let ran = false;
    const adapter = driverAsActionBot(bot);
    const run = async () => {
      if (ran) return; // run once, on the first spawn
      ran = true;
      let result: StageResult = { status: "done" };
      for (const rule of o.blueprint.rules) {
        if (rule.on !== "spawn") continue;
        const res = await runActions(rule.actions, adapter);
        if (res.status !== "done") {
          result = res;
          break;
        }
      }
      resolve(result);
    };
    const off = onSpawn(bot, ctx, () => void run());
    return { done, stop: () => off() };
  };
}

/** Build the Stage function for one configured pipeline entry. */
export function stageFactory(stage: PipelineStage): Stage {
  switch (stage.use) {
    case "auth":
      return authStage(stage.with);
    case "commands":
      return commandsStage(stage.with);
    case "chatSpam":
      return chatSpamStage(stage.with);
    case "antiAfk":
      return antiAfkStage(stage.with);
    case "movement":
      return movementStage(stage.with);
    default:
      return blueprintStage(stage.with);
  }
}

/** Resolve a config's pipeline into runnable stages for the runner. */
export function buildPipeline(config: Config): ResolvedStage[] {
  return config.pipeline.map((s) => ({
    kind: s.use,
    stage: stageFactory(s),
    onFailure: s.onFailure,
    retries: s.retries,
    timeoutMs: s.timeoutMs,
  }));
}
