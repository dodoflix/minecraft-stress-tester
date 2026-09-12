import { z } from "zod";
import { configSchema } from "./schema.js";

export type FieldKind = "string" | "number" | "integer" | "boolean" | "enum" | "string[]";

export interface FormField {
  /** Dotted path into the config, e.g. "target.host" or "ramp.count". */
  path: string;
  /** Humanized leaf name for the input label. */
  label: string;
  /** Top-level config section this field belongs to (or "general" for root-level scalars). */
  group: string;
  kind: FieldKind;
  required: boolean;
  default?: unknown;
  /** Allowed values when kind is "enum". */
  options?: string[];
  min?: number;
  max?: number;
}

type JsonNode = {
  type?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonNode>;
  required?: string[];
  items?: JsonNode;
};

/** The config zod schema as JSON Schema (input variant, so defaults are surfaced). Drift-proof:
 *  it is derived from the one schema the CLI and API already validate against. */
export function configJsonSchema(): JsonNode {
  return z.toJSONSchema(configSchema, { io: "input" }) as JsonNode;
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Zod's z.int() carries Number.MAX_SAFE_INTEGER as its bound; that is not a real UI limit.
const SENTINEL_MAX = Number.MAX_SAFE_INTEGER;

function leafKind(node: JsonNode): FieldKind | undefined {
  if (node.enum) return "enum";
  if (node.type === "boolean") return "boolean";
  if (node.type === "integer") return "integer";
  if (node.type === "number") return "number";
  if (node.type === "string") return "string";
  if (node.type === "array" && node.items?.type === "string") return "string[]";
  return undefined;
}

/**
 * Flatten the config JSON Schema into an ordered list of leaf fields for a generated form.
 * Nested objects recurse; arrays of strings and enums are leaves. The UI renders these, so the
 * form can never drift from the schema the CLI uses.
 */
export function configFormFields(schema: JsonNode = configJsonSchema()): FormField[] {
  const out: FormField[] = [];

  const walk = (node: JsonNode, prefix: string, group: string, required: Set<string>): void => {
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      const g = prefix ? group : key;
      const kind = leafKind(child);
      if (child.type === "object" && child.properties && !kind) {
        walk(child, path, g, new Set(child.required ?? []));
        continue;
      }
      if (!kind) continue;
      const field: FormField = {
        path,
        label: humanize(key),
        group: prefix ? group : "general",
        kind,
        required: required.has(key) && child.default === undefined,
      };
      if (child.default !== undefined) field.default = child.default;
      if (kind === "enum") field.options = child.enum;
      if (typeof child.minimum === "number") field.min = child.minimum;
      if (typeof child.maximum === "number" && child.maximum < SENTINEL_MAX) field.max = child.maximum;
      out.push(field);
    }
  };

  walk(schema, "", "general", new Set(schema.required ?? []));
  return out;
}
