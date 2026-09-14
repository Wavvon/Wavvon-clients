// Whether an account's key has been taken off this machine — the phrase
// revealed, or an encrypted `.wavvon-backup` exported.
//
// Device-local on purpose, the same reasoning as the web client's copy
// (`apps/web/src/utils/identityBackup.ts`): the flag says something about
// *this* machine, so it must not ride a prefs blob that syncs. A paired
// device holds a subkey it could never reveal a phrase for, and a second
// install therefore asks again — which is the right answer, because each
// install holds its own copy of nothing.
//
// Keyed by the account id from the Rust registry, since desktop is
// multi-account and the answer differs per identity.
const KEY = "wavvon.identity_backed_up";

function read(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function isIdentityBackedUp(accountId: string | null | undefined): boolean {
  if (!accountId) return true; // nothing to nag about yet
  return read()[accountId] === true;
}

export function markIdentityBackedUp(accountId: string | null | undefined): void {
  if (!accountId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [accountId]: true }));
  } catch {
    // Storage unavailable: the nudge reappears, which is the safe direction.
  }
}
