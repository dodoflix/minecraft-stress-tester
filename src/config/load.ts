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
  if (ext === ".yaml" || ext === ".yml") {
    // js-yaml throws on empty input; treat an empty file as "no overrides".
    return raw.trim() === "" ? undefined : loadYaml(raw);
  }
  return JSON.parse(raw);
}

export function loadConfig(filePath: string | undefined, cli: CliOverrides = {}): Config {
  let base: Record<string, unknown> = {};
  if (filePath) base = (readConfigFile(filePath) ?? {}) as Record<string, unknown>;

  // Only defined CLI values are spread in, so the merged object never carries
  // `undefined` — zod defaults apply for anything omitted.
  const merged = {
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
  };

  return configSchema.parse(merged);
}
