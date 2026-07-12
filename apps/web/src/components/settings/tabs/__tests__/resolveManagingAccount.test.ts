import { describe, it, expect } from "vitest";
import { resolveManagingAccount } from "../resolveManagingAccount";
import type { IdentityRecord } from "@identity/index";

// Default-resolution rule for AccountTab's "Managing" selector (see
// USER VISION: the selector defaults to the active account, and switching
// accounts is a separate, in-place action — see AccountRoot.tsx).

function account(id: string, extra: Partial<IdentityRecord> = {}): IdentityRecord {
  return { id, seed_hex: `seed-${id}`, security_nonce: 0, security_level: 0, ...extra };
}

describe("resolveManagingAccount", () => {
  const accounts = [account("acct-1", { account_label: "Primary" }), account("acct-2", { account_label: "Secondary" })];

  it("defaults to the active account when nothing has been explicitly selected", () => {
    expect(resolveManagingAccount(accounts, null, "acct-2")?.id).toBe("acct-2");
  });

  it("honors an explicit selection over the active account", () => {
    expect(resolveManagingAccount(accounts, "acct-1", "acct-2")?.id).toBe("acct-1");
  });

  it("falls back to the first account when neither the selection nor the active id match", () => {
    expect(resolveManagingAccount(accounts, "ghost-id", "also-ghost")?.id).toBe("acct-1");
  });

  it("returns null when there are no accounts yet (still loading)", () => {
    expect(resolveManagingAccount(null, null, "acct-1")).toBeNull();
    expect(resolveManagingAccount([], null, "acct-1")).toBeNull();
  });

  it("falls back to the active account if the explicitly selected id no longer exists (e.g. removed)", () => {
    expect(resolveManagingAccount(accounts, "removed-id", "acct-2")?.id).toBe("acct-2");
  });
});
