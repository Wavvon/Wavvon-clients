import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Hub, NamedProfile, NotifLevel, BlockEntry, IgnoreEntry } from "@shared/types";
import {
  getNotifPref,
  setNotifPref,
  isPasskeySupported,
  registerPasskey,
  listPasskeys,
  deletePasskey,
  renamePasskey,
  listTrustedDevices,
  revokeTrustedDevice,
} from "@platform";
import type { CredentialInfo, DeviceInfo } from "@platform";
import { loadIdentity, seedToPhrase } from "@identity/index";
import { SkinEditor, makeSeed } from "./SkinEditor";
import { SkinsGallery } from "./SkinsGallery";
import type { ThemeId, WavvonSkin } from "../skinValidation";
import { BlockIgnoreSection, AudioProfileSection } from "@wavvon/ui";
import { IdentityBackupSection } from "./IdentityBackupSection";
import { FullArchiveSection } from "./FullArchiveSection";
import { MicLevelMeter } from "./MicLevelMeter";
import { AudioDevicesSection } from "./AudioDevicesSection";
import { CameraSection } from "./CameraSection";
import { MyCertificationsSection } from "./MyCertificationsSection";
import { PushToTalkSection } from "./PushToTalkSection";
import { ProfilesSection } from "./ProfilesSection";
import { ActiveHubProfileSection } from "./ActiveHubProfileSection";
import { HomeHubsSection } from "./HomeHubsSection";
import { DevicesSection } from "./DevicesSection";

export type SettingsTab = "profile" | "notifications" | "appearance" | "account" | "voice";

const VOICE_PROFILE_KEY = "wavvon.audio_profile";

interface AudioProfileConfig {
  profile: "standard" | "music" | "custom";
  customBitrate: number | null;
  customApp: "voip" | "audio" | "lowdelay";
  customNoiseSuppress: boolean;
  customVad: boolean;
  customVadThreshold: number;
  customChannels: 1 | 2;
  customFrameMs: 20 | 40 | 60;
  customComplexity: number;
}

function loadAudioProfile(): AudioProfileConfig {
  try {
    const raw = localStorage.getItem(VOICE_PROFILE_KEY);
    if (raw) return JSON.parse(raw) as AudioProfileConfig;
  } catch {}
  return {
    profile: "standard",
    customBitrate: null,
    customApp: "voip",
    customNoiseSuppress: true,
    customVad: true,
    customVadThreshold: 0.02,
    customChannels: 1,
    customFrameMs: 20,
    customComplexity: 9,
  };
}

function saveAudioProfile(cfg: AudioProfileConfig) {
  try { localStorage.setItem(VOICE_PROFILE_KEY, JSON.stringify(cfg)); } catch {}
}

interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];
  publicKey: string | null;
  copiedKey: boolean;
  onCopyKey: () => void;
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: WavvonSkin | null;
  onSkinChange: (skin: WavvonSkin) => void;
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  activeDisplayName: string | null;
  onCreateProfile: (label: string, displayName: string, avatar: string | null) => void;
  onUpdateProfile: (id: string, patch: Partial<Omit<NamedProfile, "id">>) => void;
  onDeleteProfile: (id: string) => void;
  onSetDefaultProfile: (id: string) => void;
  onApplyProfileToHub: (id: string) => void;
  mentionPingEnabled?: boolean;
  onMentionPingChange?: (v: boolean) => void;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  onImportSkin: (skin: WavvonSkin) => void;
}

// --- Passkey management section ---

function PasskeySection({ publicKey }: { publicKey: string | null }) {
  const [passkeys, setPasskeys] = useState<CredentialInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const supported = isPasskeySupported();

  useEffect(() => {
    if (!publicKey) return;
    listPasskeys()
      .then(setPasskeys)
      .catch((e: unknown) => setError(String(e)));
  }, [publicKey]);

  async function handleAdd() {
    if (!publicKey) return;
    setRegistering(true);
    setError(null);
    try {
      await registerPasskey(publicKey, undefined, newKeyName.trim() || undefined);
      setNewKeyName("");
      setPasskeys(await listPasskeys());
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deletePasskey(id);
      setPasskeys((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  async function handleRename(id: string) {
    setError(null);
    try {
      await renamePasskey(id, renameValue.trim());
      setRenamingId(null);
      setPasskeys(await listPasskeys());
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  if (!supported) {
    return (
      <div className="settings-section" style={{ marginTop: 20 }}>
        <label className="settings-label">Passkeys</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Your browser doesn&apos;t support passkeys.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Passkeys</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
        Sign in with your device&apos;s biometrics or PIN instead of your recovery phrase. Passkeys are tied to a specific hub — register one while logged in.
      </p>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {error}
        </p>
      )}
      {passkeys === null ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>Loading…</p>
      ) : (
        <>
          {passkeys.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
              No passkeys registered yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                    padding: "8px 10px",
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  {renamingId === pk.id ? (
                    <>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        style={{ flex: 1, fontSize: "var(--text-sm)" }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(pk.id); if (e.key === "Escape") setRenamingId(null); }}
                      />
                      <button className="btn-primary" style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }} onClick={() => handleRename(pk.id)}>Save</button>
                      <button className="btn-secondary" style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }} onClick={() => setRenamingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>
                        {pk.friendly_name ?? "Unnamed passkey"}
                      </span>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {pk.last_used_at
                          ? `Used ${new Date(pk.last_used_at * 1000).toLocaleDateString()}`
                          : `Added ${new Date(pk.created_at * 1000).toLocaleDateString()}`}
                      </span>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                        onClick={() => { setRenamingId(pk.id); setRenameValue(pk.friendly_name ?? ""); }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                        onClick={() => handleDelete(pk.id)}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Passkey name (optional)"
              style={{ width: 200 }}
            />
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={registering || !publicKey}
            >
              {registering ? "Registering…" : "Add passkey"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Trusted devices section ---

function TrustedDevicesSection() {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrustedDevices()
      .then(setDevices)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await revokeTrustedDevice(id);
      setDevices((prev) => prev?.filter((d) => d.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Trusted devices</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
        Devices that have been granted long-lived access to this hub. Revoke any device you no longer recognise.
      </p>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {error}
        </p>
      )}
      {devices === null ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>Loading…</p>
      ) : devices.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>No trusted devices.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {devices.map((d) => (
            <li
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                padding: "8px 10px",
                background: "var(--bg-elevated)",
                borderRadius: "var(--r-sm)",
              }}
            >
              <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>
                {d.device_name ?? "Unnamed device"}
              </span>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Expires {new Date(d.expires_at * 1000).toLocaleDateString()}
              </span>
              <button
                className="btn-secondary"
                style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                onClick={() => handleRevoke(d.id)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const THEMES: { value: ThemeId; label: string }[] = [
  { value: "calm", label: "Calm" },
  { value: "classic", label: "Classic" },
  { value: "linear", label: "Linear" },
  { value: "light", label: "Light" },
  { value: "custom", label: "Custom" },
];

export function SettingsPage(props: SettingsPageProps) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language ?? "en").slice(0, 2);
  function changeLanguage(lng: string) {
    void i18n.changeLanguage(lng);
    try { localStorage.setItem("wavvon_language", lng); } catch { /* ignore */ }
  }
  const [voiceSounds, setVoiceSounds] = useState(() => {
    try { return localStorage.getItem("wavvon.voiceSounds") !== "0"; } catch { return true; }
  });
  function toggleVoiceSounds(on: boolean) {
    setVoiceSounds(on);
    try { localStorage.setItem("wavvon.voiceSounds", on ? "1" : "0"); } catch { /* ignore */ }
  }
  // Grouped into contiguous sections so the nav reads clearly, mirroring the
  // HubAdminPage nav pattern. Tab ids and labels are unchanged — only visual
  // grouping is added.
  const G_YOU = t("settings.nav_groups.you");
  const G_APP = t("settings.nav_groups.app");
  const G_AV = t("settings.nav_groups.audio_video");
  const G_SECURITY = t("settings.nav_groups.security");
  const TABS: { id: SettingsTab; label: string; group: string }[] = [
    { id: "profile", label: t("settings.tabs.profile"), group: G_YOU },
    { id: "notifications", label: t("settings.tabs.notifications"), group: G_APP },
    { id: "appearance", label: t("settings.tabs.appearance"), group: G_APP },
    { id: "voice", label: t("settings.tabs.voice"), group: G_AV },
    { id: "account", label: t("settings.tabs.account"), group: G_SECURITY },
  ];
  const NOTIF_LEVELS: { value: NotifLevel; label: string }[] = [
    { value: "all", label: t("settings.notifications.level.all") },
    { value: "mentions", label: t("settings.notifications.level.mentions") },
    { value: "none", label: t("settings.notifications.level.none") },
  ];
  const [audioProfile, setAudioProfile] = useState<AudioProfileConfig>(loadAudioProfile);

  function updateAudioProfile(patch: Partial<AudioProfileConfig>) {
    setAudioProfile((prev) => {
      const next = { ...prev, ...patch };
      saveAudioProfile(next);
      return next;
    });
  }
  const [hubNotifPrefs, setHubNotifPrefs] = useState<Record<string, NotifLevel>>(() => {
    const prefs: Record<string, NotifLevel> = {};
    for (const hub of props.hubs) {
      prefs[hub.hub_url] = getNotifPref(hub.hub_url);
    }
    return prefs;
  });

  return (
    <div className="settings-page" style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <aside className="settings-nav" style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "16px 8px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ padding: "0 8px", marginBottom: 12, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{t("settings.title")}</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1 }}>
          {TABS.map((tab, i) => (
            <li key={tab.id}>
              {(i === 0 || TABS[i - 1].group !== tab.group) && (
                <div className="settings-nav-group">{tab.group}</div>
              )}
              <button
                className={`settings-nav-item${props.tab === tab.id ? " active" : ""}`}
                onClick={() => props.onTab(tab.id)}
                style={{ width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: "var(--r-sm)" }}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close btn-ghost" onClick={props.onClose} style={{ marginTop: 8 }}>
          {t("modal.close")}
        </button>
      </aside>

      <main className="settings-content" style={{ flex: 1, overflow: "auto", padding: 24, position: "relative" }}>
        <button
          className="settings-close-x"
          onClick={props.onClose}
          title="Close"
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)" }}
        >
          ×
        </button>

        {props.tab === "profile" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.profile")}</h1>

            <ActiveHubProfileSection
              hubs={props.hubs}
              profiles={props.profiles}
              defaultProfileId={props.defaultProfileId}
              activeDisplayName={props.activeDisplayName}
              onApply={props.onApplyProfileToHub}
            />

            <div className="settings-section" style={{ marginTop: 20 }}>
              <label className="settings-label" htmlFor="settings-language">{t("settings.language.label")}</label>
              <select
                id="settings-language"
                value={currentLang}
                onChange={(e) => changeLanguage(e.target.value)}
                style={{ width: "100%", maxWidth: 320 }}
              >
                <option value="en">English</option>
                <option value="it">Italiano</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </div>

            <ProfilesSection
              profiles={props.profiles}
              defaultProfileId={props.defaultProfileId}
              hubs={props.hubs}
              onCreate={props.onCreateProfile}
              onUpdate={props.onUpdateProfile}
              onDelete={props.onDeleteProfile}
              onSetDefault={props.onSetDefaultProfile}
              onApplyToHub={props.onApplyProfileToHub}
            />
          </section>
        )}

        {props.tab === "notifications" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.notifications")}</h1>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label">{t("settings.notifications.mention.label")}</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                {t("settings.notifications.mention.hint")}
              </p>
              <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={props.mentionPingEnabled ?? true}
                  onChange={(e) => props.onMentionPingChange?.(e.target.checked)}
                />
                {t("settings.notifications.mention.enable")}
              </label>
            </div>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label">Voice sounds</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                Play a short tone when you or someone else joins or leaves your voice channel.
              </p>
              <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={voiceSounds}
                  onChange={(e) => toggleVoiceSounds(e.target.checked)}
                />
                Play voice join/leave sounds
              </label>
            </div>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label">{t("settings.notifications.desktop.label")}</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                {t("settings.notifications.desktop.hint")}
              </p>
              <button
                className="btn-secondary"
                onClick={() => {
                  if (typeof Notification !== "undefined") {
                    Notification.requestPermission().catch(() => {});
                  }
                }}
              >
                {t("settings.notifications.desktop.request")}
              </button>
              {typeof Notification !== "undefined" && (
                <p className="muted" style={{ marginTop: 8, fontSize: "var(--text-sm)" }}>
                  {t("settings.notifications.desktop.permission", { value: Notification.permission })}
                </p>
              )}
            </div>
            {props.hubs.length > 0 && (
              <div className="settings-section">
                <label className="settings-label">{t("settings.notifications.per_hub.label")}</label>
                <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
                  {t("settings.notifications.per_hub.hint")}
                </p>
                {props.hubs.map((hub) => (
                  <div
                    key={hub.hub_id}
                    className="settings-row"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
                  >
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{hub.hub_name}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {NOTIF_LEVELS.map((level) => (
                        <button
                          key={level.value}
                          className={hubNotifPrefs[hub.hub_url] === level.value ? "btn-primary" : "btn-secondary"}
                          style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                          onClick={() => {
                            setNotifPref(hub.hub_url, level.value);
                            setHubNotifPrefs((prev) => ({ ...prev, [hub.hub_url]: level.value }));
                          }}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {props.tab === "appearance" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.appearance")}</h1>
            <div className="settings-section">
              <label className="settings-label">{t("settings.theme.label")}</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
                {t("settings.theme.hint")}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => props.onThemeChange(t.value)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "var(--r-sm)",
                      border: props.theme === t.value ? "2px solid var(--accent)" : "1px solid var(--border)",
                      background: props.theme === t.value ? "var(--accent-subtle, var(--surface))" : "var(--surface)",
                      // Without an explicit color these inherit the base button's
                      // var(--accent-text), which is dark in calm and white in
                      // light — i.e. unreadable on a surface background.
                      color: "var(--text)",
                      cursor: "pointer",
                      fontWeight: props.theme === t.value ? 600 : 400,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {props.theme === "custom" && (
                <SkinEditor skin={props.skin ?? makeSeed("calm")} onChange={props.onSkinChange} />
              )}
            </div>
            <SkinsGallery onImport={props.onImportSkin} />
          </section>
        )}

        {props.tab === "voice" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.voice")}</h1>

            <h2 className="settings-subheading">{t("settings.voice.section.audio")}</h2>
            <AudioDevicesSection />
            <MicLevelMeter />
            <PushToTalkSection />

            <h2 className="settings-subheading">{t("settings.voice.section.camera")}</h2>
            <CameraSection />

            {/* Codec/quality tuning is advanced and rarely touched — last. */}
            <AudioProfileSection
              profile={audioProfile.profile}
              onProfile={(p) => updateAudioProfile({ profile: p })}
              customBitrate={audioProfile.customBitrate}
              onCustomBitrate={(v) => updateAudioProfile({ customBitrate: v })}
              customApp={audioProfile.customApp}
              onCustomApp={(v) => updateAudioProfile({ customApp: v })}
              customNoiseSuppress={audioProfile.customNoiseSuppress}
              onCustomNoiseSuppress={(v) => updateAudioProfile({ customNoiseSuppress: v })}
              customVad={audioProfile.customVad}
              onCustomVad={(v) => updateAudioProfile({ customVad: v })}
              customVadThreshold={audioProfile.customVadThreshold}
              onCustomVadThreshold={(v) => updateAudioProfile({ customVadThreshold: v })}
              customChannels={audioProfile.customChannels}
              onCustomChannels={(v) => updateAudioProfile({ customChannels: v })}
              customFrameMs={audioProfile.customFrameMs}
              onCustomFrameMs={(v) => updateAudioProfile({ customFrameMs: v })}
              customComplexity={audioProfile.customComplexity}
              onCustomComplexity={(v) => updateAudioProfile({ customComplexity: v })}
              inVoice={false}
            />
          </section>
        )}

        {props.tab === "account" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.account")}</h1>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label">{t("settings.account.pubkey.label")}</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                {t("settings.account.pubkey.hint")}
              </p>
              <div className="settings-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code
                  className="pubkey-display"
                  title={props.publicKey ?? ""}
                  style={{ fontFamily: "monospace", fontSize: "var(--text-sm)", background: "var(--bg-elevated)", padding: "4px 8px", borderRadius: "var(--r-sm)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {props.publicKey ? props.publicKey.slice(0, 16) + "…" + props.publicKey.slice(-8) : "—"}
                </code>
                <button className="btn-secondary" onClick={props.onCopyKey}>
                  {props.copiedKey ? t("modal.copied") : t("modal.copy")}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("settings.security.recovery.label")}</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                {t("settings.security.recovery.hint")}
              </p>
              {props.recoveryPhrase ? (
                <div
                  className="recovery-phrase"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 14px", fontFamily: "monospace", lineHeight: 1.8, fontSize: "var(--text-sm)" }}
                >
                  {props.recoveryPhrase}
                </div>
              ) : (
                <button className="btn-secondary" onClick={props.onShowRecovery}>
                  {t("settings.security.recovery.reveal")}
                </button>
              )}
            </div>
            <div className="settings-section" style={{ marginTop: 20 }}>
              {/* IdentityBackupSection renders its own "Identity backup" heading. */}
              <IdentityBackupSection publicKey={props.publicKey} />
            </div>
            <FullArchiveSection publicKey={props.publicKey} />
            <MyCertificationsSection publicKey={props.publicKey} />
            <HomeHubsSection activeHubUrl={props.hubs.find((h) => h.is_active)?.hub_url} />
            <DevicesSection activeHubUrl={props.hubs.find((h) => h.is_active)?.hub_url} />
            <PasskeySection publicKey={props.publicKey} />
            <TrustedDevicesSection />
            <BlockIgnoreSection
              blocks={props.blocks}
              ignores={props.ignores}
              onUnblock={props.onUnblock}
              onUnignore={props.onUnignore}
              knownNames={props.knownNames}
            />
          </section>
        )}
      </main>
    </div>
  );
}
