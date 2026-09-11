import type { Config } from "../config/schema.js";
import type { Behavior } from "../drivers/driver.js";
import { antiAfk } from "./antiAfk.js";
import { auth } from "./auth.js";
import { chatSpam } from "./chatSpam.js";
import { commands } from "./commands.js";
import { movement } from "./movement.js";

/**
 * Assemble the enabled behaviors for a run. Movement behaviors (antiAfk, movement) are
 * no-ops on LightBot and active on FullBot.
 */
export function buildBehaviors(config: Config): Behavior[] {
  const b = config.behaviors;
  const list: Behavior[] = [];
  if (b.auth.enabled) list.push(auth(b.auth));
  if (b.commands.enabled) list.push(commands(b.commands));
  if (b.chatSpam.enabled) list.push(chatSpam(b.chatSpam));
  if (b.antiAfk.enabled) list.push(antiAfk(b.antiAfk));
  if (b.movement.enabled) list.push(movement(b.movement));
  return list;
}
