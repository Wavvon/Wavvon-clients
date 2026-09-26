import { describe, it, expect, beforeEach, vi } from "vitest";
import { isIdentityBackedUp, markIdentityBackedUp, wasBackupPrompted, markBackupPrompted } from "../identityBackup";

// The flags are per account: two identities in one browser must not vouch for
// each other, which is the whole reason they go through accountScope.
const A = "acct-a";
const B = "acct-b";

// vitest runs in node here, so localStorage is ours to provide.
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

describe("identity backup flags", () => {
  it("starts false and is scoped to one account", () => {
    expect(isIdentityBackedUp(A)).toBe(false);
    markIdentityBackedUp(A);
    expect(isIdentityBackedUp(A)).toBe(true);
    expect(isIdentityBackedUp(B)).toBe(false);
  });

  it("tracks 'already asked' separately from 'saved'", () => {
    markBackupPrompted(A);
    expect(wasBackupPrompted(A)).toBe(true);
    expect(isIdentityBackedUp(A)).toBe(false);
  });

  it("reads false rather than throwing when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("denied"); },
      setItem() { throw new Error("denied"); },
    });
    expect(isIdentityBackedUp(A)).toBe(false);
    expect(() => markIdentityBackedUp(A)).not.toThrow();
  });
});
