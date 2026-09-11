import { describe, it, expect } from "vitest";
import { chatPacket, SIGNED_CHAT_PROTOCOL } from "../src/util/chat.js";

describe("chatPacket", () => {
  it("pre-1.19 uses the plain chat packet for messages and commands alike", () => {
    expect(chatPacket(47, "hello")).toEqual({ name: "chat", params: { message: "hello" } });
    expect(chatPacket(SIGNED_CHAT_PROTOCOL - 1, "/login pw")).toEqual({
      name: "chat",
      params: { message: "/login pw" },
    });
  });

  it("1.19+ sends plain text as chat_message", () => {
    const p = chatPacket(SIGNED_CHAT_PROTOCOL, "hi there");
    expect(p.name).toBe("chat_message");
    expect(p.params.message).toBe("hi there");
  });

  it("1.19+ sends a /command as chat_command, stripping the slash", () => {
    const p = chatPacket(770, "/register a b");
    expect(p.name).toBe("chat_command");
    expect(p.params.command).toBe("register a b");
  });

  it("boundary: exactly SIGNED_CHAT_PROTOCOL switches to the new packets", () => {
    expect(chatPacket(SIGNED_CHAT_PROTOCOL - 1, "x").name).toBe("chat");
    expect(chatPacket(SIGNED_CHAT_PROTOCOL, "x").name).toBe("chat_message");
  });
});
