/** Protocol version at which signed chat / chat_command replaced the plain chat packet (1.19). */
export const SIGNED_CHAT_PROTOCOL = 759;

export interface ChatPacket {
  name: string;
  params: Record<string, unknown>;
}

/**
 * Pick the serverbound packet for a message given the negotiated protocol version.
 * Pre-1.19: plain `chat`. 1.19+: `chat_command` for `/commands`, else `chat_message`.
 * ponytail: 1.19+ signed chat needs signing the FullBot (mineflayer) will do properly;
 * this is the best-effort unsigned form.
 */
export function chatPacket(protocol: number, message: string): ChatPacket {
  if (protocol < SIGNED_CHAT_PROTOCOL) {
    return { name: "chat", params: { message } };
  }
  if (message.startsWith("/")) {
    return {
      name: "chat_command",
      params: {
        command: message.slice(1),
        timestamp: BigInt(Date.now()),
        salt: 0n,
        argumentSignatures: [],
        messageCount: 0,
        acknowledged: Buffer.alloc(3),
      },
    };
  }
  return { name: "chat_message", params: { message } };
}
