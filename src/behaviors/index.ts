import type { Config } from "../config/schema.js";
import type { Behavior } from "../drivers/driver.js";
import { auth } from "./auth.js";
import { chatSpam } from "./chatSpam.js";

/**
 * Assemble the enabled behaviors for a run.
 * ponytail: antiAfk (head/movement to dodge no-movement kicks) needs to write
 * position packets — it lands with the FullBot driver in a later phase; keep-alive
 * covers the connection layer for now.
 */
export function buildBehaviors(config: Config): Behavior[] {
  const b = config.behaviors;
  const list: Behavior[] = [];
  if (b.auth.enabled) list.push(auth(b.auth));
  if (b.chatSpam.enabled) list.push(chatSpam(b.chatSpam));
  return list;
}
