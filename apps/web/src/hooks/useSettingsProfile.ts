import { useState, useEffect } from "react";
import type { ThemeId, WavvonSkin } from "../skinValidation";
import { applySkinTokens, clearSkinTokens } from "../skinValidation";
import type { SettingsTab } from "../components/SettingsPage";
import { loadIdentity, seedToPhrase, phraseToSeed, validatePhrase, saveIdentity, publicKeyHex } from "@identity/index";
import { makeSeed } from "../components/SkinEditor";
import type { CustomThemeStore, NamedCustomTheme } from "../utils/customThemes";
import { loadCustomThemeStore, saveCustomThemeStore, newCustomThemeId } from "../utils/customThemes";

const APPEARANCE_KEY = "wavvon:appearance";

export function useSettingsProfile(setPublicKey: (key: string) => void) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const raw = localStorage.getItem(APPEARANCE_KEY);
      if (raw) {
        const a = JSON.parse(raw) as { slot: string };
        if (["calm", "classic", "linear", "light", "custom"].includes(a.slot)) return a.slot as ThemeId;
      }
    } catch {}
    return "calm";
  });
  const [customThemeStore, setCustomThemeStoreState] = useState<CustomThemeStore>(loadCustomThemeStore);
  const activeCustomTheme = customThemeStore.themes.find((ct) => ct.id === customThemeStore.activeId) ?? null;
  const skin: WavvonSkin | null = theme === "custom" ? activeCustomTheme?.skin ?? null : null;

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

  function persistCustomThemeStore(next: CustomThemeStore) {
    setCustomThemeStoreState(next);
    saveCustomThemeStore(next);
  }

  function handleSetTheme(t: ThemeId) {
    if (t !== "custom") clearSkinTokens();
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ slot: t, skin: null }));
    setTheme(t);
  }

  // Autosaves in place to whichever named theme is currently active. If
  // there is none yet (e.g. first edit on a fresh install), creates one from
  // the seed being edited rather than dropping the edit.
  function handleSkinChange(s: WavvonSkin) {
    if (!activeCustomTheme) {
      const created: NamedCustomTheme = { id: newCustomThemeId(), name: s.name || "My theme", skin: s };
      persistCustomThemeStore({ themes: [...customThemeStore.themes, created], activeId: created.id });
    } else {
      persistCustomThemeStore({
        ...customThemeStore,
        themes: customThemeStore.themes.map((ct) =>
          ct.id === activeCustomTheme.id ? { ...ct, name: s.name || ct.name, skin: s } : ct,
        ),
      });
    }
    if (theme !== "custom") {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ slot: "custom", skin: null }));
      setTheme("custom");
    }
  }

  function handleApplyCustomTheme(id: string) {
    persistCustomThemeStore({ ...customThemeStore, activeId: id });
    handleSetTheme("custom");
  }

  function handleNewCustomTheme() {
    const base = activeCustomTheme?.skin.base ?? "calm";
    const seed = makeSeed(base, "New theme");
    const created: NamedCustomTheme = { id: newCustomThemeId(), name: seed.name, skin: seed };
    persistCustomThemeStore({ themes: [...customThemeStore.themes, created], activeId: created.id });
    handleSetTheme("custom");
  }

  function handleRenameCustomTheme(id: string, name: string) {
    const trimmed = name.trim().slice(0, 48);
    if (!trimmed) return;
    persistCustomThemeStore({
      ...customThemeStore,
      themes: customThemeStore.themes.map((ct) =>
        ct.id === id ? { ...ct, name: trimmed, skin: { ...ct.skin, name: trimmed } } : ct,
      ),
    });
  }

  function handleDuplicateCustomTheme(id: string) {
    const source = customThemeStore.themes.find((ct) => ct.id === id);
    if (!source) return;
    const name = `${source.name} copy`.slice(0, 48);
    const created: NamedCustomTheme = { id: newCustomThemeId(), name, skin: { ...source.skin, name } };
    persistCustomThemeStore({ themes: [...customThemeStore.themes, created], activeId: created.id });
    handleSetTheme("custom");
  }

  function handleDeleteCustomTheme(id: string) {
    const remaining = customThemeStore.themes.filter((ct) => ct.id !== id);
    const nextActive = customThemeStore.activeId === id ? remaining[0]?.id ?? null : customThemeStore.activeId;
    persistCustomThemeStore({ themes: remaining, activeId: nextActive });
  }

  // From SkinsGallery import: always adds a new named theme rather than
  // overwriting whichever one is currently active.
  function handleImportCustomTheme(imported: WavvonSkin) {
    const importedCount = customThemeStore.themes.filter((ct) => ct.name.startsWith("Imported theme")).length;
    const name = (imported.name && imported.name.trim()) || `Imported theme ${importedCount + 1}`;
    const created: NamedCustomTheme = { id: newCustomThemeId(), name, skin: { ...imported, name } };
    persistCustomThemeStore({ themes: [...customThemeStore.themes, created], activeId: created.id });
    handleSetTheme("custom");
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
    customThemes: customThemeStore.themes,
    activeCustomThemeId: customThemeStore.activeId,
    recoveryPhrase,
    setRecoveryPhrase,
    copiedKey,
    mentionPingEnabled,
    setMentionPingEnabled,
    handleSetTheme,
    handleSkinChange,
    handleApplyCustomTheme,
    handleNewCustomTheme,
    handleRenameCustomTheme,
    handleDuplicateCustomTheme,
    handleDeleteCustomTheme,
    handleImportCustomTheme,
    handleShowRecovery,
    handleRecoverIdentity,
    handleCopyKey,
  };
}
