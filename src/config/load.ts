import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { load as loadYaml } from "js-yaml";
import { applyScenario, type ScenarioName } from "./scenarios.js";
import { type Config, configSchema } from "./schema.js";

/** Raw CLI overrides that map onto the config before validation. */
export interface CliOverrides {
  host?: string;
  port?: number;
  count?: number;
  driver?: "light" | "full";
  authorized?: boolean;
  version?: string;
  tui?: boolean;
  csv?: boolean;
  html?: boolean;
  scenario?: ScenarioName;
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursive merge; `b` wins, nested plain objects merge (arrays/scalars replace). */
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = isPlainObject(v) && isPlainObject(prev) ? deepMerge(prev, v) : v;
  }
  return out;
}

export function loadConfig(filePath: string | undefined, cli: CliOverrides = {}): Config {
  const fileObj = filePath ? ((readConfigFile(filePath) ?? {}) as Record<string, unknown>) : {};

  // Scenario is the lowest layer: an explicit config file and CLI flags override it.
  const scenarioName = (cli.scenario ?? fileObj.scenario) as ScenarioName | undefined;
  const base = scenarioName ? deepMerge(applyScenario(scenarioName), fileObj) : fileObj;

  // Only defined CLI values are spread in, so the merged object never carries
  // `undefined` - zod defaults apply for anything omitted.
  const merged = deepMerge(base, {
    ...(cli.authorized !== undefined ? { authorized: cli.authorized } : {}),
    ...(cli.driver ? { driver: cli.driver } : {}),
    target: {
      ...(cli.host ? { host: cli.host } : {}),
      ...(cli.port ? { port: cli.port } : {}),
      ...(cli.version ? { version: cli.version } : {}),
    },
    ramp: { ...(cli.count ? { count: cli.count } : {}) },
    report: {
      ...(cli.tui ? { mode: "tui" } : {}),
      ...(cli.csv ? { csv: true } : {}),
      ...(cli.html ? { html: true } : {}),
    },
  });

  return configSchema.parse(merged);
}
