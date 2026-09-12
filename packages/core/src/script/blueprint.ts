import { z } from "zod";

/**
 * A blueprint is DATA, not code: a set of event-triggered action sequences over the Bot API.
 * Because the user only picks from a vetted, bounded set of nodes (never supplies executable
 * code), a blueprint can be interpreted safely with no sandbox. It is also the target the
 * visual node editor compiles to, and it ejects to editable TypeScript (see compile.ts).
 */

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chat"), message: z.string() }),
  z.object({ type: z.literal("command"), command: z.string() }),
  z.object({ type: z.literal("look"), yaw: z.number(), pitch: z.number() }),
  z.object({ type: z.literal("goto"), x: z.number(), y: z.number(), z: z.number() }),
  z.object({ type: z.literal("wait"), ms: z.number().int().min(0).max(600000) }),
  z.object({ type: z.literal("stop") }),
  // Completion signals: end the sequence and report an outcome the pipeline runner can gate on.
  z.object({ type: z.literal("succeed") }),
  z.object({ type: z.literal("fail"), reason: z.string().optional() }),
]);

export const TRIGGERS = ["spawn", "chat", "death"] as const;

export const ruleSchema = z.object({
  on: z.enum(TRIGGERS),
  actions: z.array(actionSchema).min(1),
});

export const blueprintSchema = z.object({
  name: z.string().default("untitled"),
  rules: z.array(ruleSchema).default([]),
});

export type Action = z.infer<typeof actionSchema>;
export type Trigger = (typeof TRIGGERS)[number];
export type Rule = z.infer<typeof ruleSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;

export interface ParseResult {
  ok: boolean;
  blueprint?: Blueprint;
  errors?: string[];
}

/** Validate untrusted blueprint JSON (text or object). Pure. */
export function parseBlueprint(input: string | unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (err) {
      return { ok: false, errors: [`parse error: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }
  const result = blueprintSchema.safeParse(raw ?? {});
  if (result.success) return { ok: true, blueprint: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** Serialize a blueprint back to pretty JSON. Pure. */
export function serializeBlueprint(blueprint: Blueprint): string {
  return `${JSON.stringify(blueprint, null, 2)}\n`;
}
