import type { NamedProfile } from "../types";
import { getScoped, setScoped } from "./accountScope";

// Multi-profile is a client-only, personal-axis feature: named
// display-name/avatar presets you can apply to a hub. Stored locally (like
// the desktop client's ~/.wavvon/profile.json); per-hub assignment lives in
// a separate map keyed by hub id. Both are per-account — each identity keeps
// its own set of named profiles.

const PROFILES_KEY = "wavvon.profiles";
const HUB_PROFILES_KEY = "wavvon.hubProfiles";

export interface ProfileStore {
  profiles: NamedProfile[];
  defaultProfileId: string | null;
}

export function loadProfiles(): ProfileStore {
  try {
    const raw = getScoped(PROFILES_KEY);
    if (raw) return JSON.parse(raw) as ProfileStore;
  } catch { /* fall through */ }
  return { profiles: [], defaultProfileId: null };
}

export function saveProfiles(store: ProfileStore): void {
  try {
    setScoped(PROFILES_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

export function loadHubProfiles(): Record<string, string> {
  try {
    const raw = getScoped(HUB_PROFILES_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* fall through */ }
  return {};
}

export function saveHubProfiles(map: Record<string, string>): void {
  try {
    setScoped(HUB_PROFILES_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function newProfileId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}
