import { describe, it, expect, vi } from "vitest";

// Minimal in-memory stand-in for the one "identity" object store this module
// touches — enough to exercise saveIdentity/removeAccount's notification side
// effect without a real IndexedDB implementation.
vi.mock("idb", () => {
  const rows = new Map<string, unknown>();
  return {
    openDB: async () => ({
      getAll: async () => Array.from(rows.values()),
      get: async (_store: string, id: string) => rows.get(id),
      put: async (_store: string, value: { id: string }) => {
        rows.set(value.id, value);
      },
      delete: async (_store: string, id: string) => {
        rows.delete(id);
      },
    }),
  };
});

import { saveIdentity, removeAccount, onAccountsChanged } from "../store";

function record(id: string) {
  return { id, seed_hex: `seed-${id}`, security_nonce: 0, security_level: 0 };
}

// No localStorage in this test's environment (node, not jsdom) — store.ts
// already treats that as "storage unavailable" and no-ops via its own
// try/catch, which is exactly the path this test exercises.
describe("onAccountsChanged", () => {
  it("fires on save and on remove, and stops firing once unsubscribed", async () => {
    let calls = 0;
    const unsubscribe = onAccountsChanged(() => calls++);

    await saveIdentity(record("acct-a"));
    expect(calls).toBe(1);

    await removeAccount("acct-a");
    expect(calls).toBe(2);

    unsubscribe();
    await saveIdentity(record("acct-b"));
    expect(calls).toBe(2);
  });

  it("notifies every subscriber independently", async () => {
    let a = 0;
    let b = 0;
    const unsubA = onAccountsChanged(() => a++);
    const unsubB = onAccountsChanged(() => b++);

    await saveIdentity(record("acct-c"));
    expect(a).toBe(1);
    expect(b).toBe(1);

    unsubA();
    await saveIdentity(record("acct-d"));
    expect(a).toBe(1);
    expect(b).toBe(2);

    unsubB();
  });
});
