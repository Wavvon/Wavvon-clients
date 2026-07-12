import { getScoped, setScoped, removeScoped } from "./accountScope";

// One default profile per account: the display name + avatar prefilled and
// auto-applied when the account joins a hub. The per-hub identity itself is
// community-axis state — each hub stores it as member state (PATCH /me) and
// is the source of truth; nothing per-hub is mirrored locally. The old named
// preset pool + hub-assignment map were deleted (see decisions.md); alpha, no
// migration — orphaned "wavvon.profiles"/"wavvon.hubProfiles" keys are ignored.

export interface DefaultProfile {
  display_name: string;
  avatar: string | null;
  bio: string | null;
  pronouns: string | null;
}

const DEFAULT_PROFILE_KEY = "wavvon.defaultProfile";

export function loadDefaultProfile(accountId?: string | null): DefaultProfile | null {
  try {
    const raw = getScoped(DEFAULT_PROFILE_KEY, accountId);
    if (raw) {
      const p = JSON.parse(raw) as Partial<DefaultProfile>;
      if (typeof p.display_name === "string") {
        return {
          display_name: p.display_name,
          avatar: p.avatar ?? null,
          bio: p.bio ?? null,
          pronouns: p.pronouns ?? null,
        };
      }
    }
  } catch { /* fall through */ }
  return null;
}

export function saveDefaultProfile(profile: DefaultProfile | null, accountId?: string | null): void {
  if (profile === null) {
    removeScoped(DEFAULT_PROFILE_KEY, accountId);
  } else {
    setScoped(DEFAULT_PROFILE_KEY, JSON.stringify(profile), accountId);
  }
}

// Hubs whose profile follows the default: linked once via "Use default" in
// the profile editor, they keep mirroring the default profile (each save of
// the default also updates them) until a field is edited there. Stored as a
// per-account list of hub ids.
const FOLLOWS_DEFAULT_KEY = "wavvon.profileFollowsDefault";

export function loadFollowsDefault(accountId?: string | null): string[] {
  try {
    const raw = getScoped(FOLLOWS_DEFAULT_KEY, accountId);
    if (raw) {
      const list = JSON.parse(raw) as unknown;
      if (Array.isArray(list)) return list.filter((x): x is string => typeof x === "string");
    }
  } catch { /* fall through */ }
  return [];
}

export function saveFollowsDefault(hubIds: string[], accountId?: string | null): void {
  setScoped(FOLLOWS_DEFAULT_KEY, JSON.stringify(hubIds), accountId);
}
