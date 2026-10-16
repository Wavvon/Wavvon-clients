import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "@wavvon/i18n";
import { switchAccountGuarded, SWITCH_BLOCKED_COOLDOWN } from "../accounts/store";
import { type ThemeId, type WavvonSkin, applySkinTokens, clearSkinTokens } from "@wavvon/ui";
import type { SettingsTab } from "../components/SettingsPage";
import i18n from "@wavvon/i18n";

interface UseSettingsProfileParams {
  setError: (msg: string) => void;
  setToast: (msg: string) => void;
}

interface LocalProfileFile {
  default_profile?: unknown;
  theme?: string | null;
}

// Theme is the only thing left in profile.json that this hook owns — the
// default profile (display name/avatar/bio/...) is now the shared
// ProfileEditorSection's concern (utils/profileEditorActions.ts). Reads
// before writing so a theme change never clobbers the default profile the
// user is mid-editing in the Profile tab, and vice versa.
async function persistTheme(theme: ThemeId | "custom", onError: (msg: string) => void) {
  try {
    const current = await invoke<LocalProfileFile>("get_profile");
    await invoke("save_profile", { profile: { ...current, theme } });
  } catch (e) {
    onError(String(e));
  }
}

export function useSettingsProfile({ setError, setToast }: UseSettingsProfileParams) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [skin, setSkin] = useState<WavvonSkin | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  async function handleSetTheme(t: ThemeId) {
    if (t !== "custom") {
      clearSkinTokens();
      setSkin(null);
      document.documentElement.dataset.theme = t;
      await persistTheme(t, setError);
    }
    setTheme(t);
    if (t !== "custom") {
      await invoke("save_appearance", { settings: { slot: t, skin: null } }).catch(() => {});
    }
  }

  async function handleSkinChange(s: WavvonSkin) {
    setSkin(s);
    document.documentElement.dataset.theme = s.base;
    applySkinTokens(s);
    setTheme("custom");
    await invoke("save_appearance", { settings: { slot: "custom", skin: s } }).catch(() => {});
  }

  async function handleShowRecovery() {
    try {
      const phrase = await invoke<string>("get_recovery_phrase");
      setRecoveryPhrase(phrase);
    } catch (e) {
      // Declining the native confirmation is a choice, not an error.
      if (String(e) !== "Cancelled") setError(String(e));
    }
  }

  async function handleClearLocalData() {
    const ok = confirm(
      "Clear local preferences?\n\nThis wipes unread, mutes, pinned channels, collapsed categories, voice settings, and recently-used emojis.\n\nYour identity and saved hubs are kept.",
    );
    if (!ok) return;
    const confirm2 = confirm(i18n.t("confirm.cannot_undo"));
    if (!confirm2) return;
    try {
      await invoke("clear_local_data");
      try {
        localStorage.removeItem("wavvon.recentEmojis");
        localStorage.removeItem("wavvon.memberSidebarHidden");
        localStorage.removeItem("wavvon.mentionPing");
      } catch {}
      setToast(i18n.t("toast.local_data_cleared"));
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRecoverIdentity(phrase: string) {
    try {
      // Brings the identity on as its own account (or finds it) and switches
      // to it in place; the active account is never overwritten.
      const id = await invoke<string>("recover_identity_from_phrase", { phrase });
      setRecoveryPhrase(null);
      const refused = await switchAccountGuarded(id);
      if (refused) {
        throw new Error(refused === SWITCH_BLOCKED_COOLDOWN ? i18n.t("settings.account.accounts.switch_cooldown") : refused);
      }
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
      setError(i18n.t("errors.copy_failed", { error: String(e) }));
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
    recoveryPhrase,
    setRecoveryPhrase,
    copiedKey,
    handleSetTheme,
    handleSkinChange,
    handleShowRecovery,
    handleClearLocalData,
    handleRecoverIdentity,
    copyPublicKey,
  };
}
