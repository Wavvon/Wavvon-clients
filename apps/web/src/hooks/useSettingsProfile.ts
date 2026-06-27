import { useState, useEffect } from "react";
import type { ThemeId, WavvonSkin } from "../skinValidation";
import { applySkinTokens, clearSkinTokens } from "../skinValidation";
import type { SettingsTab } from "../components/SettingsPage";
import { loadIdentity, seedToPhrase, phraseToSeed, validatePhrase, saveIdentity, publicKeyHex } from "@identity/index";

export function useSettingsProfile(setPublicKey: (key: string) => void) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const raw = localStorage.getItem("wavvon:appearance");
      if (raw) {
        const a = JSON.parse(raw) as { slot: string };
        if (["calm", "classic", "linear", "light"].includes(a.slot)) return a.slot as ThemeId;
        if (a.slot === "custom") return "custom";
      }
    } catch {}
    return "calm";
  });
  const [skin, setSkin] = useState<WavvonSkin | null>(() => {
    try {
      const raw = localStorage.getItem("wavvon:appearance");
      if (raw) {
        const a = JSON.parse(raw) as { slot: string; skin?: WavvonSkin | null };
        if (a.slot === "custom" && a.skin) return a.skin;
      }
    } catch {}
    return null;
  });
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [mentionPingEnabled, setMentionPingEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("wavvon.mentionPing") !== "0"; } catch { return true; }
  });

  useEffect(() => {
    if (theme === "custom" && skin) {
      document.documentElement.dataset.theme = skin.base;
      applySkinTokens(skin);
    } else {
      clearSkinTokens();
      document.documentElement.dataset.theme = theme;
    }
  }, [theme, skin]);

  function handleSetTheme(t: ThemeId) {
    if (t !== "custom") {
      clearSkinTokens();
      setSkin(null);
      localStorage.setItem("wavvon:appearance", JSON.stringify({ slot: t, skin: null }));
    }
    setTheme(t);
  }

  function handleSkinChange(s: WavvonSkin) {
    setSkin(s);
    setTheme("custom");
    localStorage.setItem("wavvon:appearance", JSON.stringify({ slot: "custom", skin: s }));
  }

  function handleShowRecovery() {
    loadIdentity().then((rec) => {
      if (rec) setRecoveryPhrase(seedToPhrase(rec.seed_hex));
    });
  }

  async function handleRecoverIdentity(ph: string) {
    if (!validatePhrase(ph)) throw new Error("Invalid phrase");
    const hex = phraseToSeed(ph);
    await saveIdentity({ id: "main", seed_hex: hex, security_nonce: 0, security_level: 0 });
    setPublicKey(publicKeyHex(hex));
    setRecoveryPhrase(null);
  }

  function handleCopyKey(publicKey: string | null) {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey).catch(() => {});
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  return {
    showSettings,
    setShowSettings,
    settingsTab,
    setSettingsTab,
    theme,
    skin,
    recoveryPhrase,
    setRecoveryPhrase,
    copiedKey,
    mentionPingEnabled,
    setMentionPingEnabled,
    handleSetTheme,
    handleSkinChange,
    handleShowRecovery,
    handleRecoverIdentity,
    handleCopyKey,
  };
}
