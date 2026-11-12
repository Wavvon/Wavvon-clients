import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProfileDraftFields } from "@wavvon/ui";
import { loadDefaultProfileAsync } from "../utils/profileEditorActions";
import type { Hub, User } from "../types";

interface MeProfileParams {
  hubs: Hub[];
  activeHubId: string | null;
  users: User[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  publicKey: string | null;
  setError: (e: string | null) => void;
}

/** First-run name prompt, default-profile seeding and the hub profile save. */
export function useMeProfile({ hubs, activeHubId, users, setUsers, publicKey, setError }: MeProfileParams) {
  // Ask for a display name once, on the first hub this identity joins with
  // none. Without it a fresh desktop identity sat in every roster as a slice
  // of its pubkey: the nickname step and this prompt were both web-only
  // (found 2026-09-06 by the web-desktop harness, which could not find its own
  // member by name).
  const [showDisplayNamePrompt, setShowDisplayNamePrompt] = useState(false);
  const me = users.find((u) => u.public_key === publicKey);
  // "Skip for now" is an answer too; without remembering it the prompt came
  // back on every launch. Keyed by account, since each one is asked once.
  const nameSkipKey = `wavvon.displayNamePromptSkipped.${publicKey}`;
  useEffect(() => {
    // Every hub where we have no name yet, not only the first one joined
    // (#250): the default profile is "how I appear when I join a hub".
    if (!me || me.display_name) return;
    const skipped = localStorage.getItem(nameSkipKey) === "1";
    // A default profile means the user already said who they want to be —
    // apply all of it instead of asking again, the same way web does.
    void loadDefaultProfileAsync()
      .then((def) => {
        if (def?.display_name?.trim()) return applyDefaultProfile(def);
        if (!skipped) setShowDisplayNamePrompt(true);
      })
      .catch(() => { if (!skipped) setShowDisplayNamePrompt(true); });
    // Only when the hub or the answer changes, not on every roster update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHubId, me?.public_key, me?.display_name]);

  async function applyDefaultProfile(def: ProfileDraftFields) {
    const hubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url;
    if (!hubUrl) return;
    try {
      await invoke("update_my_profile_on_hub", {
        hubUrl,
        profile: {
          display_name: def.display_name.trim(),
          avatar: def.avatar ?? "",
          bio: def.bio ?? "",
          pronouns: def.pronouns ?? "",
          status_message: def.status_message ?? "",
          activities: def.activities ?? "",
          accent_color: def.accent_color ?? "",
          name_color: def.name_color ?? "",
          cover: def.cover ?? "",
          favorite_hubs: def.favorite_hubs,
          show_hubs: def.show_hubs,
          birthday: def.birthday ?? "",
        },
      });
      setUsers((prev) =>
        prev.map((u) => (u.public_key === publicKey ? { ...u, display_name: def.display_name.trim(), avatar: def.avatar ?? u.avatar } : u)),
      );
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveDisplayName(name: string) {
    setShowDisplayNamePrompt(false);
    const hubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url;
    if (!hubUrl) return;
    try {
      await invoke("update_my_profile_on_hub", { hubUrl, profile: { display_name: name } });
      setUsers((prev) =>
        prev.map((u) => (u.public_key === publicKey ? { ...u, display_name: name } : u)),
      );
    } catch (e) {
      setError(String(e));
    }
  }

  return { showDisplayNamePrompt, setShowDisplayNamePrompt, nameSkipKey, saveDisplayName };
}
