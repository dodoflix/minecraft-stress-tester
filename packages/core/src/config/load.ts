import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { load as loadYaml } from "js-yaml";
import type { z } from "zod";
import { applyScenario, type ScenarioName } from "./scenarios.js";
import { type Config, configSchema, SCENARIOS } from "./schema.js";

/** Raw CLI overrides that map onto the config before validation. */
export interface CliOverrides {
  host?: string;
  port?: number;
  count?: number;
  driver?: "light" | "full";
  authorized?: boolean;
  version?: string;
  viewDistance?: number;
  shards?: number;
  tui?: boolean;
  web?: boolean;
  webPort?: number;
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

export interface BuildResult {
  success: boolean;
  config?: Config;
  issues?: z.core.$ZodIssue[];
}

/**
 * Build a run Config from a raw object (an API body or a form): apply a named scenario overlay as
 * the lowest layer (the body overrides it), consume the `scenario` key, then validate. Same layering
 * as the CLI, so the API/UI can never drift from it. Pure and unit-tested.
 */
export function buildRunConfig(raw: unknown): BuildResult {
  const obj = isPlainObject(raw) ? raw : {};
  const { scenario, ...rest } = obj as { scenario?: unknown } & Record<string, unknown>;
  const valid = typeof scenario === "string" && (SCENARIOS as readonly string[]).includes(scenario);
  const merged = valid ? deepMerge(applyScenario(scenario as ScenarioName), rest) : rest;
  const parsed = configSchema.safeParse(merged);
  return parsed.success
    ? { success: true, config: parsed.data }
    : { success: false, issues: parsed.error.issues };
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
    ...(cli.viewDistance ? { viewDistance: cli.viewDistance } : {}),
    ...(cli.shards ? { shards: cli.shards } : {}),
    target: {
      ...(cli.host ? { host: cli.host } : {}),
      ...(cli.port ? { port: cli.port } : {}),
      ...(cli.version ? { version: cli.version } : {}),
    },
    ramp: { ...(cli.count ? { count: cli.count } : {}) },
    report: {
      ...(cli.tui ? { mode: "tui" } : {}),
      ...(cli.web ? { mode: "web" } : {}),
      ...(cli.webPort ? { webPort: cli.webPort } : {}),
      ...(cli.csv ? { csv: true } : {}),
      ...(cli.html ? { html: true } : {}),
    },
  });

  return configSchema.parse(merged);
}
