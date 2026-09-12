import { z } from "zod";
import { blueprintSchema } from "../script/blueprint.js";

/**
 * Run configuration schema. Validated at load time; the rest of the app consumes
 * the parsed, typed result. The `authorized` flag is a hard trust boundary - see
 * safety/authorization.ts. Do not relax it.
 */

export const targetSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(25565),
  /** Omit to auto-detect from the server-list-ping preflight. */
  version: z.string().optional(),
});

export const rampSchema = z.object({
  /** Total bots to reach at peak. */
  count: z.number().int().min(1).default(3),
  /** New connections per second during ramp-up. */
  connectRate: z.number().positive().default(5),
  rampUpSeconds: z.number().min(0).default(0),
  holdSeconds: z.number().min(0).default(60),
  rampDownSeconds: z.number().min(0).default(0),
  /** ±fraction of jitter applied to each spawn tick so spawns don't align. */
  jitter: z.number().min(0).max(1).default(0.2),
});

export const reconnectSchema = z.object({
  enabled: z.boolean().default(true),
  maxRetries: z.number().int().min(0).default(5),
  baseBackoffMs: z.number().int().min(0).default(1000),
  maxBackoffMs: z.number().int().min(0).default(30000),
});

// Per-stage option schemas for the pipeline standard library (see pipeline/stdlib.ts).
export const authOptions = z.object({
  password: z.string().default(""),
  loginCommand: z.string().default("/login {password}"),
  registerCommand: z.string().default("/register {password} {password}"),
  /** Wait this long after joining before sending the commands, so the server's login prompt
   *  is ready. Fires on every join, so limbo/auth servers and post-transfer real servers both work. */
  delayMs: z.number().int().min(0).default(1000),
});
export const chatSpamOptions = z.object({
  message: z.string().default("minecraft-stress-tester"),
  delayMs: z.number().int().min(50).default(3000),
});
export const antiAfkOptions = z.object({
  intervalMs: z.number().int().min(200).default(3000),
});
export const movementOptions = z.object({
  intervalMs: z.number().int().min(200).default(2000),
});
export const commandsOptions = z.object({
  list: z.array(z.string()).default([]),
  /** Wait after spawn before sending, and stagger between commands. */
  delayMs: z.number().int().min(0).default(2000),
});
export const blueprintStageOptions = z.object({ blueprint: blueprintSchema });

export type AuthOptions = z.infer<typeof authOptions>;
export type ChatSpamOptions = z.infer<typeof chatSpamOptions>;
export type AntiAfkOptions = z.infer<typeof antiAfkOptions>;
export type MovementOptions = z.infer<typeof movementOptions>;
export type CommandsOptions = z.infer<typeof commandsOptions>;
export type BlueprintStageOptions = z.infer<typeof blueprintStageOptions>;

export const STAGE_KINDS = ["auth", "commands", "chatSpam", "antiAfk", "movement", "blueprint"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

// Gating fields shared by every stage: how the runner sequences and recovers.
const gate = {
  /** On a failed stage: stop the pipeline, skip to the next stage, or retry this one. */
  onFailure: z.enum(["stop", "continue", "retry"]).default("continue"),
  retries: z.number().int().min(0).default(0),
  /** Fail the stage if it has not completed within this many ms (unset = wait indefinitely). */
  timeoutMs: z.number().int().min(0).optional(),
};

/** One ordered pipeline stage: a standard-library behavior (or a blueprint) plus its options and
 *  gating policy. Replaces the old fixed `behaviors.*` toggles. */
export const stageSchema = z.discriminatedUnion("use", [
  z.object({ use: z.literal("auth"), with: authOptions.prefault({}), ...gate }),
  z.object({ use: z.literal("commands"), with: commandsOptions.prefault({}), ...gate }),
  z.object({ use: z.literal("chatSpam"), with: chatSpamOptions.prefault({}), ...gate }),
  z.object({ use: z.literal("antiAfk"), with: antiAfkOptions.prefault({}), ...gate }),
  z.object({ use: z.literal("movement"), with: movementOptions.prefault({}), ...gate }),
  z.object({ use: z.literal("blueprint"), with: blueprintStageOptions, ...gate }),
]);

export const pipelineSchema = z.array(stageSchema).default([]);
export type PipelineStage = z.infer<typeof stageSchema>;

export const accountsSchema = z.object({
  mode: z.enum(["offline", "microsoft"]).default("offline"),
  usernamePrefix: z.string().default("mcst"),
  /** Microsoft/Xbox account identifiers (emails) to rotate over when mode is "microsoft". */
  microsoftAccounts: z.array(z.string()).default([]),
  /** Where prismarine-auth caches Microsoft tokens (one subfolder per account). */
  profilesFolder: z.string().default("./.mcst-accounts"),
});

export const proxiesSchema = z.object({
  /** SOCKS5/SOCKS4 proxies, e.g. "socks5://user:pass@host:1080", "socks4://host:1080", "host:1080". */
  list: z.array(z.string()).default([]),
  /** Max simultaneous bots per proxy (spreads source IPs past per-IP antibot limits). */
  maxPerProxy: z.number().int().min(1).default(50),
  /** Fetch free public proxies automatically (no registration). Untrusted third parties: see docs. */
  auto: z.boolean().default(false),
  /** Provider list URLs (plain-text proxy lists). Empty = a built-in set of free proxy lists. */
  autoProviders: z.array(z.string()).default([]),
  /** Health-check fetched proxies against the target and keep only the reachable ones. */
  autoValidate: z.boolean().default(true),
  /** Target number of bots to keep proxied. Proxies found = ceil(autoMax / maxPerProxy) * autoOverfetch. */
  autoMax: z.number().int().min(1).default(50),
  /** Buffer multiplier on the proxies found, against proxies that die mid-run. */
  autoOverfetch: z.number().min(1).default(2),
  /** How many fetched proxies to health-check at most. Unset = probe the whole pool until autoMax
   *  usable are found (slower, but finds the most proxies). Set a number to cap it (faster). */
  autoMaxProbes: z.number().int().min(1).optional(),
  /** Simultaneous health-checks. */
  autoConcurrency: z.number().int().min(1).default(100),
  /** Per-proxy health-check timeout (ms). */
  autoTimeoutMs: z.number().int().min(100).default(4000),
});

export const SCENARIOS = ["join-flood", "sustained-load", "chat-flood", "chunk-thrash"] as const;

export const configSchema = z.object({
  /** Trust gate: must be explicitly true. Named as an affirmation, not a toggle. */
  authorized: z.boolean().default(false),
  target: targetSchema,
  driver: z.enum(["light", "full"]).default("light"),
  // Chunk view distance each bot requests. Low (2) keeps the client light: the server
  // sends far fewer chunk packets per bot. Raise it to stress chunk loading.
  viewDistance: z.number().int().min(2).max(32).default(2),
  // Worker processes to spread the run across (one event loop each). 1 = single process.
  shards: z.number().int().min(1).default(1),
  ramp: rampSchema.prefault({}),
  reconnect: reconnectSchema.prefault({}),
  /** Ordered per-bot behavior pipeline; each stage gates the next on success. Replaces behaviors.*. */
  pipeline: pipelineSchema,
  accounts: accountsSchema.prefault({}),
  proxies: proxiesSchema.prefault({}),
  report: z
    .object({
      dir: z.string().default("./reports"),
      json: z.boolean().default(true),
      csv: z.boolean().default(false),
      html: z.boolean().default(false),
      /** Live view during a run: console lines, a full-screen TUI, or a local web page. */
      mode: z.enum(["console", "tui", "web"]).default("console"),
      webPort: z.number().int().min(1).max(65535).default(8787),
    })
    .prefault({}),
});

export type Config = z.infer<typeof configSchema>;
export type Target = z.infer<typeof targetSchema>;
