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
    const raw = localStorage.getItem(SAVED_HUBS_KEY);
    return raw ? (JSON.parse(raw) as SavedHub[]) : [];
  } catch {
    return [];
  }
}

export function saveSavedHubs(hubs: SavedHub[]): void {
  localStorage.setItem(SAVED_HUBS_KEY, JSON.stringify(hubs));
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

export function loadActiveHubId(): string | null {
  return localStorage.getItem(ACTIVE_HUB_KEY);
}

export function saveActiveHubId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_HUB_KEY, id);
  else localStorage.removeItem(ACTIVE_HUB_KEY);
}

// Tokens: sessionStorage by default; localStorage when rememberMe=true.
export function saveToken(hubId: string, token: string, rememberMe: boolean): void {
  const key = TOKEN_PREFIX + hubId;
  if (rememberMe) localStorage.setItem(key, token);
  else sessionStorage.setItem(key, token);
}

export function loadToken(hubId: string): string | null {
  const key = TOKEN_PREFIX + hubId;
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

export function clearToken(hubId: string): void {
  const key = TOKEN_PREFIX + hubId;
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}
