import { describe, expect, it } from "vitest";
import { extractOwnPing } from "../src/util/playerPing.js";

describe("extractOwnPing", () => {
  it("reads pre-1.19.3 shape (name + ping)", () => {
    const data = {
      data: [
        { name: "other", ping: 5 },
        { name: "me", ping: 42 },
      ],
    };
    expect(extractOwnPing(data, "me")).toBe(42);
  });

  it("reads 1.19.3+ shape (player.name + latency)", () => {
    const data = { data: [{ player: { name: "me" }, latency: 33 }] };
    expect(extractOwnPing(data, "me")).toBe(33);
  });

  it("returns undefined when our name is absent", () => {
    expect(extractOwnPing({ data: [{ name: "other", ping: 5 }] }, "me")).toBeUndefined();
  });

  it("returns undefined for a non-array / null payload", () => {
    expect(extractOwnPing(null, "me")).toBeUndefined();
    expect(extractOwnPing({ data: "nope" }, "me")).toBeUndefined();
    expect(extractOwnPing({}, "me")).toBeUndefined();
  });

  it("ignores a matching entry with no numeric ping", () => {
    expect(extractOwnPing({ data: [{ name: "me" }] }, "me")).toBeUndefined();
    expect(extractOwnPing({ data: [{ name: "me", ping: -1 }] }, "me")).toBeUndefined();
  });
});
