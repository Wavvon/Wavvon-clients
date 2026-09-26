import { getScoped, setScoped } from "./accountScope";

// Whether this identity's key has been taken off this browser — the phrase
// revealed, or an encrypted .wavvon-backup exported. A newcomer who joins
// from an invite link never sees the phrase on the way in (that screen is the
// single biggest thing between a clicked link and a first message), so this is
// what keeps the app honest about it afterwards.
//
// Per account, and device-local on purpose: it rides no prefs blob, because
// that blob is decrypted with a key derived from the very seed this is about,
// and a paired device holds a subkey it could never reveal a phrase for
// anyway. A second browser therefore asks again, which is the right answer —
// each browser holds its own copy of nothing.
const BACKED_UP_KEY = "wavvon.identity_backed_up";

// Separate from the flag above so "already asked" outlives "still unsaved":
// the prompt fires once, at the first thing worth losing, and after that the
// badge on the settings gear is the only reminder.
const PROMPTED_KEY = "wavvon.identity_backup_prompted";

export function isIdentityBackedUp(accountId?: string | null): boolean {
  return getScoped(BACKED_UP_KEY, accountId) === "1";
}

export function markIdentityBackedUp(accountId?: string | null): void {
  setScoped(BACKED_UP_KEY, "1", accountId);
}

export function wasBackupPrompted(accountId?: string | null): boolean {
  return getScoped(PROMPTED_KEY, accountId) === "1";
}

export function markBackupPrompted(accountId?: string | null): void {
  setScoped(PROMPTED_KEY, "1", accountId);
}
