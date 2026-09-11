/**
 * Flatten a Minecraft disconnect reason to a plain string. Reasons arrive as a raw
 * string, a JSON-encoded chat component, or a chat-component object ({text}/{translate}).
 */
export function stringifyReason(reason: unknown): string {
  if (reason == null) return "unknown";
  if (typeof reason === "string") {
    try {
      const parsed = JSON.parse(reason);
      return stringifyReason(parsed);
    } catch {
      return reason;
    }
  }
  const r = reason as Record<string, unknown>;
  if (typeof r.text === "string") return r.text || "unknown";
  if (typeof r.translate === "string") return r.translate;
  return JSON.stringify(reason);
}
