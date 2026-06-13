import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NamedProfile, User } from "../types";
import { type ThemeId, type VoxplySkin, applySkinTokens, clearSkinTokens } from "../skinValidation";
import { newProfileId } from "@voxply/utils";
import type { SettingsTab } from "../components/SettingsPage";

interface UseSettingsProfileParams {
  hasActiveHub: boolean;
  setUsers: (updater: (prev: User[]) => User[]) => void;
  setPublicKey: (key: string) => void;
  setError: (msg: string) => void;
  setToast: (msg: string) => void;
}

export function useSettingsProfile({
  hasActiveHub,
  setUsers,
  setPublicKey,
  setError,
  setToast,
}: UseSettingsProfileParams) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [theme, setTheme] = useState<ThemeId>("calm");
  const [skin, setSkin] = useState<VoxplySkin | null>(null);
  const [profiles, setProfiles] = useState<NamedProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  async function persistProfileFile(overrides: {
    profiles?: NamedProfile[];
    defaultProfileId?: string | null;
    theme?: ThemeId;
  } = {}) {
    const next = {
      profiles: overrides.profiles ?? profiles,
      default_profile_id: overrides.defaultProfileId ?? defaultProfileId,
      theme: overrides.theme ?? theme,
    };
    try {
      await invoke("save_profile", { profile: next });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateProfile() {
    const fresh: NamedProfile = {
      id: newProfileId(),
      label: `Profile ${profiles.length + 1}`,
      display_name: "",
      avatar: null,
    };
    const next = [...profiles, fresh];
    setProfiles(next);
    const nextDefault = profiles.length === 0 ? fresh.id : defaultProfileId;
    if (nextDefault !== defaultProfileId) setDefaultProfileId(nextDefault);
    await persistProfileFile({ profiles: next, defaultProfileId: nextDefault });
  }

  async function handleUpdateProfile(
    id: string,
    patch: Partial<Omit<NamedProfile, "id">>,
  ) {
    const next = profiles.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setProfiles(next);
    await persistProfileFile({ profiles: next });
  }

  async function handleDeleteProfile(id: string) {
    if (profiles.length <= 1) {
      setError("You need at least one profile.");
      return;
    }
    if (!confirm("Delete this profile?")) return;
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    let nextDefault = defaultProfileId;
    if (defaultProfileId === id) {
      nextDefault = next[0]?.id ?? null;
      setDefaultProfileId(nextDefault);
    }
    await persistProfileFile({ profiles: next, defaultProfileId: nextDefault });
  }

  async function handleSetDefaultProfile(id: string) {
    setDefaultProfileId(id);
    await persistProfileFile({ defaultProfileId: id });
    setToast("Default profile updated");
  }

  async function handleApplyProfileToHub(id: string) {
    if (!hasActiveHub) return;
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    try {
      if (p.display_name.trim()) {
        await invoke("update_display_name", { displayName: p.display_name });
      }
      await invoke("update_avatar", { avatar: p.avatar ?? "" });
      const u = await invoke<User[]>("list_users");
      setUsers(() => u);
      setToast(`Applied "${p.label}" to this hub`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSetTheme(t: ThemeId) {
    if (t !== "custom") {
      clearSkinTokens();
      setSkin(null);
      document.documentElement.dataset.theme = t;
      await invoke("save_appearance", { settings: { slot: t, skin: null } }).catch(() => {});
    }
    setTheme(t);
    await persistProfileFile({ theme: t });
  }

  async function handleSkinChange(s: VoxplySkin) {
    setSkin(s);
    setTheme("custom");
    document.documentElement.dataset.theme = s.base;
    applySkinTokens(s);
    await invoke("save_appearance", { settings: { slot: "custom", skin: s } }).catch(() => {});
  }

  async function handleShowRecovery() {
    try {
      const phrase = await invoke<string>("get_recovery_phrase");
      setRecoveryPhrase(phrase);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleClearLocalData() {
    const ok = confirm(
      "Clear local preferences?\n\nThis wipes unread, mutes, pinned channels, collapsed categories, voice settings, and recently-used emojis.\n\nYour identity and saved hubs are kept.",
    );
    if (!ok) return;
    const confirm2 = confirm("Are you sure? This can't be undone.");
    if (!confirm2) return;
    try {
      await invoke("clear_local_data");
      try {
        localStorage.removeItem("voxply.recentEmojis");
        localStorage.removeItem("voxply.memberSidebarHidden");
        localStorage.removeItem("voxply.mentionPing");
      } catch {}
      setToast("Local data cleared — reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRecoverIdentity(phrase: string) {
    try {
      const newPubkey = await invoke<string>("recover_identity_from_phrase", { phrase });
      setRecoveryPhrase(null);
      setPublicKey(newPubkey);
      setToast("Identity restored — reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }

  async function copyPublicKey(publicKey: string | null) {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch (e) {
      setError("Failed to copy: " + e);
    }
  }

  return {
    showSettings,
    setShowSettings,
    settingsTab,
    setSettingsTab,
    theme,
    setTheme,
    skin,
    setSkin,
    profiles,
    setProfiles,
    defaultProfileId,
    setDefaultProfileId,
    recoveryPhrase,
    setRecoveryPhrase,
    copiedKey,
    persistProfileFile,
    handleCreateProfile,
    handleUpdateProfile,
    handleDeleteProfile,
    handleSetDefaultProfile,
    handleApplyProfileToHub,
    handleSetTheme,
    handleSkinChange,
    handleShowRecovery,
    handleClearLocalData,
    handleRecoverIdentity,
    copyPublicKey,
  };
}
