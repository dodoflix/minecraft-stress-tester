import type { Action, Blueprint, Rule } from "./blueprint.js";

/** One action as a line of Bot API code. */
function actionLine(a: Action): string {
  switch (a.type) {
    case "chat":
      return `bot.chat(${JSON.stringify(a.message)});`;
    case "command":
      return `bot.command(${JSON.stringify(a.command)});`;
    case "look":
      return `await bot.look(${a.yaw}, ${a.pitch});`;
    case "goto":
      return `await bot.goto(${a.x}, ${a.y}, ${a.z});`;
    case "wait":
      return `await new Promise((r) => setTimeout(r, ${a.ms}));`;
    case "stop":
      return "bot.stop();";
  }
}

function ruleBlock(rule: Rule): string {
  if (rule.on === "spawn") {
    return rule.actions.map((a) => `  ${actionLine(a)}`).join("\n");
  }
  const body = rule.actions.map((a) => `    ${actionLine(a)}`).join("\n");
  return `  bot.on(${JSON.stringify(rule.on)}, async () => {\n${body}\n  });`;
}

/**
 * Eject a blueprint to an editable TypeScript module that drives the Bot API. This is the
 * "compile the visual graph to the same Bot API" path (code generation, not a second engine):
 * spawn rules run inline, event rules become subscriptions. Pure.
 */
export function compileToCode(blueprint: Blueprint): string {
  const spawnRules = blueprint.rules.filter((r) => r.on === "spawn");
  const eventRules = blueprint.rules.filter((r) => r.on !== "spawn");
  const lines = spawnRules.map(ruleBlock).filter(Boolean);
  const subs = eventRules.map(ruleBlock);
  const body = [...lines, ...subs].join("\n") || "  // no rules";
  return `// Generated from blueprint: ${blueprint.name}
// Drives the mcst Bot API. Import DebugBot from your mcst build.
import type { DebugBot } from "minecraft-stress-tester";

export async function run(bot: DebugBot & { on: (e: string, l: () => void) => void }): Promise<void> {
${body}
}
`;
}
