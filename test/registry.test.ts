import { describe, expect, it } from "vitest";
import { Registry } from "../src/engine/registry.js";
import { FakeBot } from "./helpers/fakeBot.js";

const spec = (id: number) => new FakeBot({ id }).spec;

describe("Registry", () => {
  it("adds and retrieves by id", () => {
    const r = new Registry();
    const bot = new FakeBot({ id: 1 });
    r.add(bot, spec(1));
    expect(r.get(1)?.bot).toBe(bot);
    expect(r.size).toBe(1);
  });

  it("replace swaps the bot but keeps retries", () => {
    const r = new Registry();
    r.add(new FakeBot({ id: 2 }), spec(2));
    r.incRetry(2);
    const fresh = new FakeBot({ id: 2 });
    r.replace(2, fresh);
    expect(r.get(2)?.bot).toBe(fresh);
    expect(r.get(2)?.retries).toBe(1);
  });

  it("incRetry increments and returns the new count", () => {
    const r = new Registry();
    r.add(new FakeBot({ id: 3 }), spec(3));
    expect(r.incRetry(3)).toBe(1);
    expect(r.incRetry(3)).toBe(2);
  });

  it("incRetry on a missing id returns Infinity (never respawns a gone bot)", () => {
    expect(new Registry().incRetry(99)).toBe(Infinity);
  });

  it("remove deletes the entry", () => {
    const r = new Registry();
    r.add(new FakeBot({ id: 4 }), spec(4));
    r.remove(4);
    expect(r.get(4)).toBeUndefined();
    expect(r.size).toBe(0);
  });

  it("all() lists every live entry", () => {
    const r = new Registry();
    r.add(new FakeBot({ id: 5 }), spec(5));
    r.add(new FakeBot({ id: 6 }), spec(6));
    expect(
      r
        .all()
        .map((e) => e.spec.id)
        .sort(),
    ).toEqual([5, 6]);
  });
});
