import type { Config } from "../config/schema.js";

export class AuthorizationError extends Error {}

/**
 * Hard trust boundary. A stress tester is a load generator; run against a server
 * you do not own or lack written permission to test, and you are committing a
 * denial-of-service attack. Refuse to proceed without an explicit affirmation.
 *
 * This is deliberately not simplified away and not overridable by a quiet default.
 */
export function assertAuthorized(config: Config): void {
  if (config.authorized !== true) {
    throw new AuthorizationError(
      [
        "Refusing to start: authorization not confirmed.",
        "",
        `Target: ${config.target.host}:${config.target.port}`,
        "",
        "Only stress test servers you own or have explicit written permission to test.",
        "Set `authorized: true` in your config (or pass --i-am-authorized) to confirm.",
      ].join("\n"),
    );
  }
}
