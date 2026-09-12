import { describe, expect, it, vi } from "vitest";
import { hello, parseWsMessage, WS_PROTOCOL_VERSION } from "../src/wsProtocol.js";
import { handleWsMessage, type WsDeps } from "../src/wsRouter.js";

describe("parseWsMessage", () => {
  it("parses each valid client message", () => {
    expect(parseWsMessage('{"type":"ping","id":"1"}')).toEqual({
      ok: true,
      message: { type: "ping", id: "1" },
    });
    expect(parseWsMessage({ type: "debug", line: "pos" })).toMatchObject({
      ok: true,
      message: { type: "debug", line: "pos" },
    });
    expect(
      parseWsMessage({ type: "attach", target: { host: "h", port: 25565 }, authorized: true }),
    ).toMatchObject({
      ok: true,
      message: { type: "attach", authorized: true, target: { host: "h", port: 25565 } },
    });
    expect(parseWsMessage({ type: "script.start", code: "await bot.chat('x')" })).toMatchObject({ ok: true });
    expect(parseWsMessage({ type: "script.stop" })).toMatchObject({ ok: true });
    // attach with a version and no port; ids default to undefined.
    const attach = parseWsMessage({
      type: "attach",
      target: { host: "h", version: "1.21" },
      authorized: false,
    });
    expect(attach).toMatchObject({
      ok: true,
      message: { target: { host: "h", version: "1.21", port: undefined }, id: undefined },
    });
  });

  it("rejects malformed messages", () => {
    expect(parseWsMessage("{ bad json")).toMatchObject({ ok: false });
    expect(parseWsMessage({})).toMatchObject({ ok: false, error: "missing type" });
    expect(parseWsMessage({ type: "attach", authorized: true })).toMatchObject({ ok: false });
    expect(parseWsMessage({ type: "debug" })).toMatchObject({ ok: false });
    expect(parseWsMessage({ type: "script.start" })).toMatchObject({ ok: false });
    expect(parseWsMessage({ type: "nope" })).toMatchObject({ ok: false, error: /unknown/ });
  });

  it("builds a versioned hello", () => {
    expect(hello("1.2.3")).toEqual({ type: "hello", protocol: WS_PROTOCOL_VERSION, version: "1.2.3" });
  });
});

describe("handleWsMessage", () => {
  const base = (): WsDeps => ({
    version: "1",
    attach: vi.fn(async () => ({ ok: true })),
    dispatch: vi.fn(async (line: string) => ({ text: `ran ${line}`, done: line === "quit" })),
    startScript: vi.fn(() => ({ ok: true })),
    stopScript: vi.fn(),
  });

  it("answers ping with pong", async () => {
    expect(await handleWsMessage({ type: "ping", id: "9" }, base())).toEqual([{ type: "pong", id: "9" }]);
  });

  it("attaches and acks", async () => {
    const deps = base();
    const out = await handleWsMessage({ type: "attach", target: { host: "h" }, authorized: true }, deps);
    expect(deps.attach).toHaveBeenCalledWith({ host: "h" }, true);
    expect(out).toEqual([{ type: "ack", id: undefined, ok: true, error: undefined }]);
  });

  it("dispatches a debug line, and errors without an attached bot", async () => {
    const deps = base();
    expect(await handleWsMessage({ type: "debug", id: "1", line: "pos" }, deps)).toEqual([
      { type: "result", id: "1", text: "ran pos", done: false },
    ]);
    const detached = { ...base(), dispatch: null };
    expect(await handleWsMessage({ type: "debug", line: "pos" }, detached)).toMatchObject([
      { type: "error" },
    ]);
  });

  it("starts and stops scripts", async () => {
    const deps = base();
    expect(await handleWsMessage({ type: "script.start", code: "x", timeoutMs: 5 }, deps)).toMatchObject([
      { type: "ack", ok: true },
    ]);
    expect(deps.startScript).toHaveBeenCalledWith("x", 5);
    expect(await handleWsMessage({ type: "script.stop" }, deps)).toMatchObject([{ type: "ack", ok: true }]);
    expect(deps.stopScript).toHaveBeenCalled();
  });
});
