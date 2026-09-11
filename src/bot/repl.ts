import type { DebugBot } from "./botApi.js";

export interface ReplResult {
  text: string;
  /** True when the session should end (quit/exit). */
  done?: boolean;
}

export const HELP = [
  "commands:",
  "  pos                    show position",
  "  health                 show health and food",
  "  say <message>          send a chat message",
  "  cmd <command>          run a server command (or just type /command)",
  "  look <yaw> <pitch>     face a direction (radians)",
  "  goto <x> <y> <z>       pathfind to a block",
  "  players                list online players",
  "  entities [radius]      list nearby entities (default radius 16)",
  "  inv                    list inventory",
  "  stop                   stop moving / cancel pathfinding",
  "  help                   show this help",
  "  quit                   disconnect and exit",
].join("\n");

/** Parse `count` numbers off the argument list, or null if any is missing/NaN. */
function nums(args: string[], count: number): number[] | null {
  if (args.length < count) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const n = Number(args[i]);
    if (Number.isNaN(n)) return null;
    out.push(n);
  }
  return out;
}

const fmt = (n: number) => n.toFixed(1);

/**
 * Map one REPL input line to a DebugBot action and a text response. Pure (all parsing,
 * validation, and formatting live here); the readline loop just feeds lines in and prints
 * the result, so the interesting logic is fully unit-tested against a fake bot.
 */
export async function dispatch(line: string, bot: DebugBot): Promise<ReplResult> {
  const trimmed = line.trim();
  if (trimmed === "") return { text: "" };

  // A bare "/command" is shorthand for `cmd command`.
  if (trimmed.startsWith("/")) {
    bot.command(trimmed);
    return { text: `> ${trimmed}` };
  }

  const [cmd, ...args] = trimmed.split(/\s+/);
  const rest = trimmed.slice((cmd ?? "").length).trim();

  switch (cmd) {
    case "help":
    case "?":
      return { text: HELP };

    case "pos":
    case "position": {
      const p = bot.position();
      return { text: p ? `${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}` : "position unknown (not spawned)" };
    }

    case "health":
    case "vitals": {
      const v = bot.vitals();
      return { text: v ? `health ${fmt(v.health)}  food ${fmt(v.food)}` : "vitals unknown" };
    }

    case "say":
      if (!rest) return { text: "usage: say <message>" };
      bot.chat(rest);
      return { text: `> ${rest}` };

    case "cmd":
      if (!rest) return { text: "usage: cmd <command>" };
      bot.command(rest);
      return { text: `> /${rest.replace(/^\//, "")}` };

    case "look": {
      const parsed = nums(args, 2);
      if (!parsed) return { text: "usage: look <yaw> <pitch>" };
      await bot.look(parsed[0] as number, parsed[1] as number);
      return { text: `looking ${fmt(parsed[0] as number)} ${fmt(parsed[1] as number)}` };
    }

    case "goto": {
      const parsed = nums(args, 3);
      if (!parsed) return { text: "usage: goto <x> <y> <z>" };
      await bot.goto(parsed[0] as number, parsed[1] as number, parsed[2] as number);
      return { text: `arrived near ${parsed.map(fmt).join(", ")}` };
    }

    case "players": {
      const list = bot.players();
      return { text: list.length ? list.join(", ") : "no players online" };
    }

    case "entities":
    case "ent": {
      const radius = args[0] !== undefined ? Number(args[0]) : 16;
      if (Number.isNaN(radius)) return { text: "usage: entities [radius]" };
      const found = bot.nearbyEntities(radius);
      if (!found.length) return { text: `no entities within ${fmt(radius)}m` };
      return {
        text: found
          .slice(0, 20)
          .map((e) => `#${e.id} ${e.name} (${e.type}) ${fmt(e.distance)}m`)
          .join("\n"),
      };
    }

    case "inv":
    case "inventory": {
      const items = bot.inventory();
      if (!items.length) return { text: "inventory empty" };
      return { text: items.map((i) => `${i.count}x ${i.name} @${i.slot}`).join("\n") };
    }

    case "stop":
      bot.stop();
      return { text: "stopped" };

    case "quit":
    case "exit":
      bot.disconnect();
      return { text: "bye", done: true };

    default:
      return { text: `unknown command: ${cmd} (try "help")` };
  }
}
