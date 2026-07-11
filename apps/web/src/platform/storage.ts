import { accountKey, getScoped, setScoped, removeScoped } from "../utils/accountScope";

// Hub list, active-hub pointer, and session tokens are per-account state —
// see utils/accountScope.ts. Each key below is namespaced under whichever
// account is currently active.
const SAVED_HUBS_KEY = "wavvon:saved_hubs";
const ACTIVE_HUB_KEY = "wavvon:active_hub";
const TOKEN_PREFIX = "wavvon:token:";

export interface SavedHub {
  hub_id: string;
  hub_name: string;
  hub_url: string;
  hub_icon: string | null;
  remember_token: boolean;
}

export function loadSavedHubs(): SavedHub[] {
  try {
    const raw = getScoped(SAVED_HUBS_KEY);
    return raw ? (JSON.parse(raw) as SavedHub[]) : [];
  } catch {
    return [];
  }
}

export function saveSavedHubs(hubs: SavedHub[]): void {
  setScoped(SAVED_HUBS_KEY, JSON.stringify(hubs));
}

export function upsertSavedHub(hub: SavedHub): void {
  const list = loadSavedHubs().filter((h) => h.hub_id !== hub.hub_id);
  list.push(hub);
  saveSavedHubs(list);
}

export function removeSavedHub(hubId: string): void {
  saveSavedHubs(loadSavedHubs().filter((h) => h.hub_id !== hubId));
  clearToken(hubId);
}

/** Update only the stored display name of a hub. Returns true if it changed.
 * (Deliberately not upsertSavedHub: callers usually hold the listHubs()
 * projection, which lacks remember_token — upserting it would strip the
 * stored flag.) */
export function renameSavedHub(hubId: string, name: string): boolean {
  const list = loadSavedHubs();
  const hub = list.find((h) => h.hub_id === hubId);
  if (!hub || hub.hub_name === name) return false;
  hub.hub_name = name;
  saveSavedHubs(list);
  return true;
}

export function loadActiveHubId(): string | null {
  return getScoped(ACTIVE_HUB_KEY);
}

export function saveActiveHubId(id: string | null): void {
  if (id) setScoped(ACTIVE_HUB_KEY, id);
  else removeScoped(ACTIVE_HUB_KEY);
}

// Tokens: sessionStorage by default; localStorage when rememberMe=true.
// Namespaced under the active account so switching accounts in the same tab
// can never read another account's cached session token.
export function saveToken(hubId: string, token: string, rememberMe: boolean): void {
  const key = accountKey(TOKEN_PREFIX + hubId);
  if (rememberMe) localStorage.setItem(key, token);
  else sessionStorage.setItem(key, token);
}

export function loadToken(hubId: string): string | null {
  const key = accountKey(TOKEN_PREFIX + hubId);
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

export function clearToken(hubId: string): void {
  const key = accountKey(TOKEN_PREFIX + hubId);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}
