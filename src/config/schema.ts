import { z } from "zod";

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

export const behaviorsSchema = z.object({
  antiAfk: z
    .object({
      enabled: z.boolean().default(true),
      intervalMs: z.number().int().min(200).default(3000),
    })
    .prefault({}),
  chatSpam: z
    .object({
      enabled: z.boolean().default(false),
      message: z.string().default("minecraft-stress-tester"),
      delayMs: z.number().int().min(50).default(3000),
    })
    .prefault({}),
  auth: z
    .object({
      enabled: z.boolean().default(false),
      password: z.string().default(""),
      loginCommand: z.string().default("/login {password}"),
      registerCommand: z.string().default("/register {password} {password}"),
    })
    .prefault({}),
});

export const accountsSchema = z.object({
  mode: z.enum(["offline", "microsoft"]).default("offline"),
  usernamePrefix: z.string().default("mcst"),
});

export const configSchema = z.object({
  /** Trust gate: must be explicitly true. Named as an affirmation, not a toggle. */
  authorized: z.boolean().default(false),
  target: targetSchema,
  driver: z.enum(["light", "full"]).default("light"),
  ramp: rampSchema.prefault({}),
  reconnect: reconnectSchema.prefault({}),
  behaviors: behaviorsSchema.prefault({}),
  accounts: accountsSchema.prefault({}),
  report: z
    .object({
      dir: z.string().default("./reports"),
      json: z.boolean().default(true),
      csv: z.boolean().default(false),
      html: z.boolean().default(false),
      /** Live view during a run: plain console lines or a full-screen TUI dashboard. */
      mode: z.enum(["console", "tui"]).default("console"),
    })
    .prefault({}),
});

export type Config = z.infer<typeof configSchema>;
export type Target = z.infer<typeof targetSchema>;
