import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceThemeStore, useThemes } from "@wavvon/ui";
import type { SettingsTab } from "@components/settings/SettingsPage";
import {
  holdsMasterSeed,
  loadIdentity,
  seedToPhrase,
  phraseToSeed,
  validatePhrase,
  resolveOrCreateAccount,
  switchAccount,
  getPostSwitchReturn,
  SWITCH_BLOCKED_COOLDOWN,
} from "@identity/index";
import { getScoped } from "../utils/accountScope";
import { markIdentityBackedUp } from "../utils/identityBackup";

export function useSettingsProfile(setPublicKey: (key: string) => void, initialView?: "settings-account") {
  const { t } = useTranslation();
  // Two ways to land back on Settings → Account after a switch: `initialView`
  // (the in-place path — AccountRoot forwards it as a prop, set in memory,
  // no storage involved) or the one-shot `getPostSwitchReturn()` flag (the
  // reload-fallback path only, written to sessionStorage just before the
  // reload). Consumed at module init, NOT here — a render-time read+remove
  // races StrictMode's double render.
  const postSwitchReturn = getPostSwitchReturn();
  const effectiveInitialView = initialView ?? (postSwitchReturn === "settings-account" ? "settings-account" : undefined);
  const [showSettings, setShowSettings] = useState(effectiveInitialView === "settings-account");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(
    effectiveInitialView === "settings-account" ? "accounts" : "profile",
  );
  const themes = useThemes(deviceThemeStore);

  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [mentionPingEnabled, setMentionPingEnabled] = useState<boolean>(() => {
    try { return getScoped("wavvon.mentionPing") !== "0"; } catch { return true; }
  });

  function handleShowRecovery() {
    loadIdentity().then((rec) => {
      // A paired device's seed is its own subkey; its words would restore a
      // different identity, and reading them must not mark anything backed up.
      if (!rec || !holdsMasterSeed(rec)) return;
      setRecoveryPhrase(seedToPhrase(rec.seed_hex));
      // Reading the words is the point at which they can be written down —
      // the only signal available short of asking the user to type them back.
      markIdentityBackedUp(rec.id);
    });
  }

  // Recovering a different phrase here means bringing another account onto
  // this device (or switching to it, if it's already here) — never silently
  // overwriting the active identity. Switches to it (in place) when it
  // differs from the currently active one.
  async function handleRecoverIdentity(ph: string) {
    if (!validatePhrase(ph)) throw new Error("Invalid phrase");
    const hex = phraseToSeed(ph);
    const { account } = await resolveOrCreateAccount(hex);
    setRecoveryPhrase(null);
    const refused = switchAccount(account.id, "settings-account");
    if (refused) {
      throw new Error(refused === SWITCH_BLOCKED_COOLDOWN ? t("settings.account.accounts.switch_cooldown") : refused);
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
    mentionPingEnabled,
    setMentionPingEnabled,
    handleShowRecovery,
    handleRecoverIdentity,
  };
}
