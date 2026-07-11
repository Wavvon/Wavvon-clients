import { getActiveAccountId } from "../identity/store";

// Namespaces a localStorage key under the given (or currently active)
// account, so every per-account key ends up "wavvon:acct:<accountId>:<key>".
// Multi-account isolation depends on every per-user localStorage read/write
// in the app routing through this — see accountKey.md-style callers in
// platform/storage.ts, utils/drafts.ts, utils/profiles.ts, etc.
//
// With no active account (nothing has signed in yet) there's no namespace to
// scope into; callers in that state shouldn't be persisting per-user data
// anyway, so the key is returned unscoped as a harmless fallback rather than
// throwing.
export function accountKey(key: string, accountId?: string | null): string {
  const id = accountId ?? getActiveAccountId();
  if (!id) return key;
  return `wavvon:acct:${id}:${key}`;
}

export function getScoped(key: string, accountId?: string | null): string | null {
  try {
    return localStorage.getItem(accountKey(key, accountId));
  } catch {
    return null;
  }
}

export function setScoped(key: string, value: string, accountId?: string | null): void {
  try {
    localStorage.setItem(accountKey(key, accountId), value);
  } catch {
    // storage unavailable
  }
}

export function removeScoped(key: string, accountId?: string | null): void {
  try {
    localStorage.removeItem(accountKey(key, accountId));
  } catch {
    // storage unavailable
  }
}
