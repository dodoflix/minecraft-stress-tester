import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { load as loadYaml } from "js-yaml";
import { type Config, configSchema } from "./schema.js";

/** Raw CLI overrides that map onto the config before validation. */
export interface CliOverrides {
  host?: string;
  port?: number;
  count?: number;
  driver?: "light" | "full";
  authorized?: boolean;
  version?: string;
}

function readConfigFile(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  const ext = extname(path).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") return loadYaml(raw);
  return JSON.parse(raw);
}

/**
 * Map the old flat config.json (host/port/count/prefix/*Enabled) onto the new
 * nested shape. Only applied when the object looks legacy (has top-level `host`
 * but no `target`), so new configs pass through untouched.
 */
function migrateLegacy(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj.target || obj.host === undefined) return obj;
  const g = obj as Record<string, unknown>;
  return {
    target: { host: g.host, port: g.port ? Number(g.port) : undefined, version: g.version },
    ramp: { count: g.count },
    accounts: { usernamePrefix: g.prefix },
    behaviors: {
      antiAfk: { enabled: g.antiAfkEnabled },
      chatSpam: { enabled: g.chatSpamEnabled, message: g.chatSpamMessage, delayMs: g.chatSpamDelay },
      auth: {
        enabled: g.authenticationEnabled,
        password: g.password,
        loginCommand: g.loginCommand,
        registerCommand: g.registerCommand,
      },
    },
    authorized: g.authorized,
  };
}

/** Drop undefined values so zod defaults apply instead of failing on `undefined`. */
function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = prune(v);
    }
    return out as T;
  }
  return value;
}

export function loadConfig(filePath: string | undefined, cli: CliOverrides = {}): Config {
  let base: Record<string, unknown> = {};
  if (filePath) base = migrateLegacy((readConfigFile(filePath) ?? {}) as Record<string, unknown>);

  const merged = prune({
    ...base,
    ...(cli.authorized !== undefined ? { authorized: cli.authorized } : {}),
    ...(cli.driver ? { driver: cli.driver } : {}),
    target: {
      ...(base.target as object),
      ...(cli.host ? { host: cli.host } : {}),
      ...(cli.port ? { port: cli.port } : {}),
      ...(cli.version ? { version: cli.version } : {}),
    },
    ramp: {
      ...(base.ramp as object),
      ...(cli.count ? { count: cli.count } : {}),
    },
  });

  return configSchema.parse(merged);
}
