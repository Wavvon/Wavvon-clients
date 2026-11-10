import { useEffect, useRef, useState } from "react";
import { hubFetch, fetchAllUsers, getActiveHubId, HubApiError } from "@platform";
import { loadDefaultProfile, saveDefaultProfile, type DefaultProfile } from "../utils/profiles";
import type { MeInfo, User } from "@shared/types";

/** The member's own profile on the active hub: seeding the local default
 *  profile from the hub, applying that default to hubs that have no name for
 *  us yet, the first-run name prompt, and the post-save refreshes. */
export function useMeProfile({ meInfo, setMeInfo, setUsers, activeHubId, showHubError }: {
  meInfo: MeInfo | null;
  setMeInfo: React.Dispatch<React.SetStateAction<MeInfo | null>>;
  setUsers: (users: User[]) => void;
  activeHubId: string | null;
  showHubError: (msg: string) => void;
}) {
  const [showDisplayNamePrompt, setShowDisplayNamePrompt] = useState(false);
  const namePromptedHubsRef = useRef<Set<string>>(new Set());

  // Profile on the active hub (community-axis; the hub is the source of
  // truth, PATCH /me writes it). The per-account default profile is read from
  // scoped storage at use time — no App state to go stale.
  async function handleUpdateHubProfile(profile: DefaultProfile) {
    try {
      await hubFetch("/me", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: profile.display_name,
          avatar: profile.avatar ?? "",
          bio: profile.bio ?? "",
          pronouns: profile.pronouns ?? "",
          status_message: profile.status_message ?? "",
          activities: profile.activities ?? "",
          accent_color: profile.accent_color ?? "",
          name_color: profile.name_color ?? "",
          cover: profile.cover ?? "",
          favorite_hubs: profile.favorite_hubs,
          show_hubs: profile.show_hubs,
          birthday: profile.birthday ?? "",
        }),
      });
      hubFetch("/me").then((r) => r.json() as Promise<MeInfo>).then(setMeInfo).catch(() => {});
      fetchAllUsers().then(setUsers).catch(() => {});
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  // The settings profile editor PATCHes any hub itself (via that hub's own
  // session); App only needs to refresh its active-hub mirrors afterwards.
  function handleHubProfileSaved(hubId: string) {
    if (hubId !== activeHubId) return;
    hubFetch("/me").then((r) => r.json() as Promise<MeInfo>).then(setMeInfo).catch(() => {});
    fetchAllUsers().then(setUsers).catch(() => {});
  }

  // An identity restored from a .wavvon-backup never went through onboarding,
  // so it has no local default profile even though the hub already holds the
  // real one -- the profile editor opened on an empty card (placeholder name,
  // no avatar) for a user the hub knows perfectly well. Seed the default from
  // the hub member state the first time we see it; the guard means a real
  // default is never overwritten.
  // ponytail: first hub to load wins if several are joined -- fine for a
  // restore, revisit if per-hub profiles ever diverge before the seed.
  useEffect(() => {
    if (!meInfo?.display_name) return;
    if (loadDefaultProfile()) return;
    saveDefaultProfile({
      display_name: meInfo.display_name,
      avatar: meInfo.avatar,
      bio: meInfo.bio,
      pronouns: meInfo.pronouns,
      status_message: meInfo.status_message,
      activities: meInfo.activities,
      accent_color: meInfo.accent_color,
      name_color: meInfo.name_color,
      cover: meInfo.cover,
      favorite_hubs: meInfo.favorite_hubs,
      show_hubs: meInfo.show_hubs,
      birthday: meInfo.birthday,
    });
  }, [meInfo]);

  useEffect(() => {
    // Every hub where we have no name yet, not only the first one joined
    // (#250): the default profile is "how I appear when I join a hub".
    // meInfo is replaced on each /me load of the active hub, so this targets
    // that hub; after a successful apply it reloads with a name and stops.
    if (meInfo !== null && !meInfo.display_name) {
      // A default profile means the user already told us who they want to
      // be — apply it silently instead of asking again. Read at fire time so
      // edits made in Settings since mount are honored.
      const def = loadDefaultProfile();
      const hubId = getActiveHubId();
      if (def) {
        void handleUpdateHubProfile(def);
      } else if (hubId && !namePromptedHubsRef.current.has(hubId)) {
        // Once per hub per session: "Skip for now" must not come back on
        // every /me reload.
        namePromptedHubsRef.current.add(hubId);
        setShowDisplayNamePrompt(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meInfo]);

  async function handleSaveFirstRunName(typed: string) {
    const name = typed.trim();
    if (!name) { setShowDisplayNamePrompt(false); return; }
    try {
      await hubFetch("/me", { method: "PATCH", body: JSON.stringify({ display_name: name }) });
      setMeInfo((prev) => prev ? { ...prev, display_name: name } : prev);
    } catch { /* non-critical, ignore */ }
    setShowDisplayNamePrompt(false);
  }

  return { showDisplayNamePrompt, setShowDisplayNamePrompt, handleSaveFirstRunName, handleHubProfileSaved };
}
