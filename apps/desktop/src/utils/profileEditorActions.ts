import { invoke } from "@tauri-apps/api/core";
import type { Hub } from "../types";
import type { HubProfileSnapshot, MyCertification, ProfileDraftFields, ProfileEditorActions } from "@wavvon/ui";

// Desktop's platform wiring for the shared ProfileEditorSection
// (packages/ui). Mirrors web's @platform/commands/myProfile.ts + the /me
// PATCH shape, backed by admin.rs's hub-parameterized get_user_profile /
// update_my_profile_on_hub commands instead of stored fetch sessions.
//
// Known gap (settings-ia.md piece 2, left optional-unwired): the default
// profile is stored device-globally via local_store.rs's profile.json, not
// per-account — the prior multi-account commit flagged this ("local_store
// prefs stay device-global") and it isn't fixed here. Managing a non-active
// account's default profile edits the same global file the active account
// sees.

export const NO_HUB_SESSION = "NO_HUB_SESSION";

interface LocalProfileFile {
  default_profile?: ProfileDraftFields | null;
  theme?: string | null;
}

let cachedDefaultProfile: ProfileDraftFields | null = null;

export async function loadDefaultProfileAsync(): Promise<ProfileDraftFields | null> {
  const file = await invoke<LocalProfileFile>("get_profile");
  cachedDefaultProfile = file.default_profile ?? null;
  return cachedDefaultProfile;
}

// Synchronous read for the ProfileEditorActions contract (mirrors web's
// localStorage-backed loadDefaultProfile). Desktop's real source of truth is
// the async Tauri call above; callers should invoke loadDefaultProfileAsync
// once up front (SettingsPage does, on mount) so this cache is warm.
function loadDefaultProfileSync(): ProfileDraftFields | null {
  return cachedDefaultProfile;
}

async function saveDefaultProfileAsync(profile: ProfileDraftFields): Promise<void> {
  const current = await invoke<LocalProfileFile>("get_profile");
  cachedDefaultProfile = profile;
  await invoke("save_profile", { profile: { ...current, default_profile: profile } });
}

const FOLLOWS_KEY = "wavvon.profileFollowsDefault";

function loadFollowsDefault(): string[] {
  try {
    const raw = localStorage.getItem(FOLLOWS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveFollowsDefault(hubIds: string[]): void {
  try {
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(hubIds));
  } catch {
    /* storage unavailable */
  }
}

interface RawHubProfile {
  display_name?: string | null;
  avatar?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  status_message?: string | null;
  activities?: string | null;
  accent_color?: string | null;
  cover?: string | null;
  favorite_hubs?: ProfileDraftFields["favorite_hubs"];
  show_hubs?: boolean;
  badges?: { id: string; label: string }[] | string[];
}

function shapeHubProfile(raw: RawHubProfile): HubProfileSnapshot {
  const badges = (raw.badges ?? []).map((b) => (typeof b === "string" ? b : b.label));
  return {
    display_name: raw.display_name ?? "",
    avatar: raw.avatar ?? null,
    bio: raw.bio ?? null,
    pronouns: raw.pronouns ?? null,
    status_message: raw.status_message ?? null,
    activities: raw.activities ?? null,
    accent_color: raw.accent_color ?? null,
    cover: raw.cover ?? null,
    favorite_hubs: raw.favorite_hubs ?? [],
    show_hubs: raw.show_hubs ?? false,
    badges,
  };
}

export function buildProfileEditorActions(hubs: Hub[]): ProfileEditorActions {
  function hubUrlFor(hubId: string): string {
    return hubs.find((h) => h.hub_id === hubId)?.hub_url ?? hubId;
  }

  return {
    async getMyProfileOnHub(hubId, pubkey) {
      const raw = await invoke<RawHubProfile>("get_user_profile", { hubUrl: hubUrlFor(hubId), pubkey });
      return shapeHubProfile(raw);
    },
    async updateMyProfileOnHub(hubId, profile) {
      await invoke("update_my_profile_on_hub", {
        hubUrl: hubUrlFor(hubId),
        profile: {
          display_name: profile.display_name,
          avatar: profile.avatar ?? "",
          bio: profile.bio ?? "",
          pronouns: profile.pronouns ?? "",
          status_message: profile.status_message ?? "",
          activities: profile.activities ?? "",
          accent_color: profile.accent_color ?? "",
          cover: profile.cover ?? "",
          favorite_hubs: profile.favorite_hubs,
          show_hubs: profile.show_hubs,
        },
      });
    },
    noHubSessionError: NO_HUB_SESSION,
    loadDefaultProfile: () => loadDefaultProfileSync(),
    saveDefaultProfile: (profile) => { void saveDefaultProfileAsync(profile); },
    loadFollowsDefault: () => loadFollowsDefault(),
    saveFollowsDefault: (hubIds) => saveFollowsDefault(hubIds),
    listMyCertifications: () => invoke<MyCertification[]>("fetch_my_certs"),
  };
}
