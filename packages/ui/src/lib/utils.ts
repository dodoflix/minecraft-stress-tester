import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Nested get/set by dotted path, used by the schema-driven config form.
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined;
  }, obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  const out = { ...obj };
  let node = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i] as string;
    const prev = node[k];
    node[k] = prev && typeof prev === "object" && !Array.isArray(prev) ? { ...(prev as object) } : {};
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1] as string] = value;
  return out;
}
