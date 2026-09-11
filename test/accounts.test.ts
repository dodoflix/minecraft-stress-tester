import { describe, expect, it } from "vitest";
import { accountsSchema } from "../src/config/schema.js";
import { AccountManager } from "../src/net/accounts.js";

const cfg = (over: Record<string, unknown> = {}) => accountsSchema.parse(over);

describe("AccountManager", () => {
  it("offline mode generates distinct valid usernames", () => {
    const m = new AccountManager(cfg());
    const a = m.next(1);
    const b = m.next(2);
    expect(a.auth).toBe("offline");
    expect(a.username).toMatch(/^[A-Za-z0-9_]+$/);
    expect(a.username).not.toBe(b.username);
  });

  it("microsoft mode rotates over the configured accounts", () => {
    const m = new AccountManager(cfg({ mode: "microsoft", microsoftAccounts: ["a@x.com", "b@x.com"] }));
    expect(m.next(0)).toEqual({ username: "a@x.com", auth: "microsoft" });
    expect(m.next(1)).toEqual({ username: "b@x.com", auth: "microsoft" });
    expect(m.next(2).username).toBe("a@x.com"); // wraps
  });

  it("throws if microsoft mode has no accounts", () => {
    const m = new AccountManager(cfg({ mode: "microsoft" }));
    expect(() => m.next(0)).toThrow(/microsoftAccounts/);
  });
});
