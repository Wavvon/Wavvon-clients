// A hub build remembers that an identity moved to the user client, so the
// next visit to this origin does not offer to start over as if nothing had
// happened — which is how one person becomes two users on one hub
// (decisions.md 2026-08-25).
//
// Device-global rather than account-scoped on purpose: the account row is
// gone by the time this is written, so there is no scope left to hang it on.
// It holds the pubkey that left, which is all the notice needs to say.

const MIGRATED_KEY = "wavvon:migrated_to_user_client";

export function markMigrated(pubkey: string): void {
  try {
    localStorage.setItem(MIGRATED_KEY, pubkey);
  } catch {
    // Storage unavailable — the notice is a courtesy, not a correctness
    // requirement. The identity still moved.
  }
}

export function migratedPubkey(): string | null {
  try {
    return localStorage.getItem(MIGRATED_KEY);
  } catch {
    return null;
  }
}

/** Called when an identity is created or restored on this origin again: the
 *  user deliberately started over here, so the notice has served its purpose
 *  and must stop claiming they left. */
export function clearMigrated(): void {
  try {
    localStorage.removeItem(MIGRATED_KEY);
  } catch {
    // as above
  }
}
