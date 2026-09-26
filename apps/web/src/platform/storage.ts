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
  /**
   * Last known `capabilities` from this hub's `/info` — what it can do, as
   * strings the client tests membership in. Persisted for the same reason
   * hub_name and hub_icon are: so the UI is right on the first frame after a
   * reload, before refreshHubInfo has answered. Refreshed every time /info is
   * fetched. `undefined` means "never asked" (a hub saved by an older build);
   * an empty array means the hub genuinely advertised nothing, i.e. it
   * predates capability advertising.
   */
  capabilities?: string[];
  /** Last known hub version. For display and "this hub is very old" only —
   * never gate a feature on it, that's what `capabilities` is for. */
  hub_version?: string;
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

/** Update the stored name AND icon of a hub (see renameSavedHub for why this
 * isn't upsertSavedHub). Returns true if either field changed. */
export function updateSavedHub(hubId: string, name: string, icon: string | null): boolean {
  const list = loadSavedHubs();
  const hub = list.find((h) => h.hub_id === hubId);
  if (!hub || (hub.hub_name === name && hub.hub_icon === icon)) return false;
  hub.hub_name = name;
  hub.hub_icon = icon;
  saveSavedHubs(list);
  return true;
}

/**
 * Follow a hub that has changed address.
 *
 * A hub sharing a host lives at an owner-chosen name (`/hub/MangiaDaPippo`), and
 * that name can change. The hub reports its current one as `canonical_url` on
 * `/info`, so a rename reaches every client that reconnects — no broken
 * sessions, no re-adding the hub by hand.
 *
 * Keyed on `hub_id`, which is the hub's **pubkey** and never changes. That is
 * what makes following an address change safe: we move where we look, not who
 * we think we are talking to. Returns true if the stored URL changed.
 */
export function updateSavedHubUrl(hubId: string, hubUrl: string): boolean {
  const list = loadSavedHubs();
  const hub = list.find((h) => h.hub_id === hubId);
  if (!hub || hub.hub_url === hubUrl) return false;
  hub.hub_url = hubUrl;
  saveSavedHubs(list);
  return true;
}

/** Record what a hub advertised on its last `/info`. Separate from
 * updateSavedHub for the same reason that one exists: callers of each hold
 * different subsets and must not clobber the fields they don't carry. */
export function saveHubCapabilities(
  hubId: string,
  capabilities: string[],
  version: string | undefined,
): void {
  const list = loadSavedHubs();
  const hub = list.find((h) => h.hub_id === hubId);
  if (!hub) return;
  hub.capabilities = capabilities;
  hub.hub_version = version;
  saveSavedHubs(list);
}

export function loadActiveHubId(): string | null {
  return getScoped(ACTIVE_HUB_KEY);
}

export function saveActiveHubId(id: string | null): void {
  if (id) setScoped(ACTIVE_HUB_KEY, id);
  else removeScoped(ACTIVE_HUB_KEY);
}

// Tokens: sessionStorage by default; localStorage when rememberMe=true.
// Namespaced under the active account (or an explicit accountId) so
// switching accounts in the same tab can never read another account's
// cached session token. hubFetchAs (platform/hubFetchAs.ts) passes an
// explicit accountId to cache a background-acquired token under the TARGET
// (non-active) account's own namespace — the same place that account's own
// session would cache it once it becomes active.
export function saveToken(hubId: string, token: string, rememberMe: boolean, accountId?: string): void {
  const key = accountKey(TOKEN_PREFIX + hubId, accountId);
  if (rememberMe) localStorage.setItem(key, token);
  else sessionStorage.setItem(key, token);
}

export function loadToken(hubId: string, accountId?: string): string | null {
  const key = accountKey(TOKEN_PREFIX + hubId, accountId);
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

export function clearToken(hubId: string, accountId?: string): void {
  const key = accountKey(TOKEN_PREFIX + hubId, accountId);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}
