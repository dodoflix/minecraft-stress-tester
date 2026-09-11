import type { Config } from "../config/schema.js";
import { makeUsername } from "../util/names.js";

export interface Account {
  username: string;
  auth: "offline" | "microsoft";
}

/**
 * Assigns an identity to each bot: a generated offline username, or a Microsoft account
 * rotated round-robin from the configured list. The actual Microsoft device-code auth is
 * handled by mineflayer/minecraft-protocol (`auth: "microsoft"` + `profilesFolder`).
 */
export class AccountManager {
  private idx = 0;

  constructor(private readonly accounts: Config["accounts"]) {}

  next(id: number): Account {
    if (this.accounts.mode === "microsoft") {
      const list = this.accounts.microsoftAccounts;
      if (list.length === 0) {
        throw new Error("accounts.mode is 'microsoft' but accounts.microsoftAccounts is empty");
      }
      const username = list[this.idx % list.length] as string;
      this.idx++;
      return { username, auth: "microsoft" };
    }
    return { username: makeUsername(this.accounts.usernamePrefix, id), auth: "offline" };
  }
}
