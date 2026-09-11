import { describe, it, expect } from "vitest";
import { stringifyReason } from "../src/util/reason.js";

describe("stringifyReason", () => {
  it("null/undefined -> 'unknown'", () => {
    expect(stringifyReason(null)).toBe("unknown");
    expect(stringifyReason(undefined)).toBe("unknown");
  });

  it("plain string passes through", () => {
    expect(stringifyReason("Banned by admin")).toBe("Banned by admin");
  });

  it("JSON-encoded chat component is parsed", () => {
    expect(stringifyReason('{"text":"You are AFK"}')).toBe("You are AFK");
  });

  it("chat-component object uses text, then translate", () => {
    expect(stringifyReason({ text: "kicked" })).toBe("kicked");
    expect(stringifyReason({ translate: "multiplayer.disconnect.kicked" })).toBe(
      "multiplayer.disconnect.kicked",
    );
  });

  it("empty text falls back to 'unknown'", () => {
    expect(stringifyReason({ text: "" })).toBe("unknown");
  });

  it("unrecognized object is JSON-stringified, not dropped", () => {
    expect(stringifyReason({ extra: [1] })).toBe('{"extra":[1]}');
  });
});
