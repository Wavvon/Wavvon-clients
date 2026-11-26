import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "@wavvon/i18n";
import { listAccounts } from "../accounts/store";
import { markIdentityBackedUp } from "../utils/identityBackup";
import { deviceThemeStore, useThemes } from "@wavvon/ui";
import type { SettingsTab } from "../components/SettingsPage";

interface UseSettingsProfileParams {
  setError: (msg: string) => void;
  setToast: (msg: string) => void;
}

export function useSettingsProfile({ setError, setToast }: UseSettingsProfileParams) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const themes = useThemes(deviceThemeStore);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  async function handleShowRecovery() {
    try {
      const phrase = await invoke<string>("get_recovery_phrase");
      setRecoveryPhrase(phrase);
      // Reading the words is when they can be written down.
      const active = (await listAccounts()).find((a) => a.is_active);
      markIdentityBackedUp(active?.id);
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
    themes,
    recoveryPhrase,
    setRecoveryPhrase,
    copiedKey,
    handleShowRecovery,
    handleClearLocalData,
    copyPublicKey,
  };
}
