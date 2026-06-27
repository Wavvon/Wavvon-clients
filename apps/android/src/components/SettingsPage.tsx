import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Hub, NamedProfile, BlockEntry, IgnoreEntry, DndSettings } from "../types";
import { formatPubkey } from "@wavvon/core";
import { MicLevelMeter } from "./MicLevelMeter";
import { PttKeyBinder } from "./PttKeyBinder";
import { ThemePicker } from "./ThemePicker";
import { SkinEditor, makeSeed } from "./SkinEditor";
import { SkinsGallery } from "./SkinsGallery";
import type { ThemeId, WavvonSkin } from "../skinValidation";
import { ProfileTab } from "./ProfileTab";
import { RestoreIdentitySection } from "./RestoreIdentitySection";
import { PairingSection } from "./PairingSection";
import { HomeHubSection } from "./HomeHubSection";
import { IdentityBackupSection } from "./IdentityBackupSection";
import { DndSection } from "./DndSection";
import { BlockIgnoreSection } from "@wavvon/ui";

export type SettingsTab =
  | "profile"
  | "account"
  | "appearance"
  | "voice"
  | "security"
  | "privacy"
  | "notifications"
  | "devices"
  | "about";

export interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];
  // Profile system: multiple named profiles with one marked default.
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  onCreateProfile: () => void;
  onUpdateProfile: (
    id: string,
    patch: Partial<Omit<NamedProfile, "id">>,
  ) => void;
  onDeleteProfile: (id: string) => void;
  onSetDefaultProfile: (id: string) => void;
  onApplyProfileToHub: (id: string) => void;

  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: WavvonSkin | null;
  onSkinChange: (skin: WavvonSkin) => void;
  hasActiveHub: boolean;
  publicKey: string | null;
  copiedKey: boolean;
  onCopyKey: () => void;
  audioInputs: string[];
  audioOutputs: string[];
  voiceInputDevice: string;
  voiceOutputDevice: string;
  onInputDeviceChange: (v: string) => void;
  onOutputDeviceChange: (v: string) => void;
  vadThreshold: number;
  onVadChange: (v: number) => void;
  voiceMode: "vad" | "ptt";
  onVoiceModeChange: (m: "vad" | "ptt") => void;
  pttKey: string;
  onPttKeyChange: (k: string) => void;
  mentionPingEnabled: boolean;
  onMentionPingChange: (v: boolean) => void;
  micLevel: number;
  micTesting: boolean;
  onToggleMicTest: () => void;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  onRecoverIdentity: (phrase: string) => Promise<void>;
  onClearLocalData: () => void;
  blockedEntries: BlockEntry[];
  ignoredEntries: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  dnd: DndSettings;
  onDndChange: (s: DndSettings) => void;
  onExportBackup: (passphrase: string, label: string) => Promise<string>;
  onImportBackup: (fileContent: string, passphrase: string) => Promise<"same" | "replaced" | "conflict">;
  onImportSkin: (skin: WavvonSkin) => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const { i18n } = useTranslation();
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(false);
  const [publicHubIds, setPublicHubIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | string>("idle");

  async function handleSavePublicProfile() {
    try {
      const entries = publicProfileEnabled
        ? props.hubs
            .filter((h) => publicHubIds.has(h.hub_id))
            .map((h) => ({
              hub_url: h.hub_url,
              hub_name: h.hub_name,
              joined_at: Math.floor(Date.now() / 1000),
            }))
        : [];
      const activeProfile =
        props.profiles.find((p) => p.id === props.defaultProfileId) ??
        props.profiles[0];
      await invoke("save_public_profile", {
        entries,
        displayName: activeProfile?.display_name ?? "",
        avatar: activeProfile?.avatar ?? null,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "account", label: "Account" },
    { id: "appearance", label: "Appearance" },
    { id: "voice", label: "Voice & Video" },
    { id: "security", label: "Security" },
    { id: "privacy", label: "Privacy" },
    { id: "notifications", label: "Notifications" },
    { id: "devices", label: "Devices" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>Settings</h2>
        <ul>
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                className={`settings-nav-item ${props.tab === t.id ? "active" : ""}`}
                onClick={() => props.onTab(t.id)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={props.onClose}>
          Close (ESC)
        </button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title="Close">
          ×
        </button>
        {props.tab === "profile" && (
          <ProfileTab
            hasActiveHub={props.hasActiveHub}
            profiles={props.profiles}
            defaultProfileId={props.defaultProfileId}
            hubs={props.hubs}
            onCreateProfile={props.onCreateProfile}
            onUpdateProfile={props.onUpdateProfile}
            onDeleteProfile={props.onDeleteProfile}
            onSetDefaultProfile={props.onSetDefaultProfile}
            onApplyProfileToHub={props.onApplyProfileToHub}
          />
        )}
        {props.tab === "account" && (
          <section>
            <h1>Account</h1>
            <div className="settings-section">
              <label className="settings-label">Your public key</label>
              <p className="muted">
                Your unique identity. Share this with someone to send you a
                friend request. Same key works on every hub.
              </p>
              <div className="settings-row">
                <code className="pubkey-display" title={props.publicKey ?? ""}>
                  {formatPubkey(props.publicKey)}
                </code>
                <button onClick={props.onCopyKey}>
                  {props.copiedKey ? "Copied" : "Copy full key"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Local data</label>
              <p className="muted">
                Wipes per-device preferences (unread, mutes, pins, voice
                settings, recents). Your identity and the list of saved hubs
                are kept — use Restore from recovery phrase or Leave hub for
                those.
              </p>
              <button
                className="btn-secondary"
                onClick={props.onClearLocalData}
              >
                Clear local data…
              </button>
            </div>
            <div className="settings-section">
              <label className="settings-label">Public hub profile</label>
              <p className="muted">
                Let people see which hubs you're on. Visible to anyone who views your profile.
              </p>
              {props.hubs.length === 0 ? (
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  Join a hub first to configure your public profile.
                </p>
              ) : (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={publicProfileEnabled}
                      onChange={(e) => setPublicProfileEnabled(e.target.checked)}
                    />
                    Make my hub list public
                  </label>
                  {publicProfileEnabled && (
                    <div style={{ marginTop: "8px" }}>
                      {props.hubs.map((h) => (
                        <div key={h.hub_id} className="settings-row">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={publicHubIds.has(h.hub_id)}
                              onChange={(e) => {
                                setPublicHubIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(h.hub_id);
                                  else next.delete(h.hub_id);
                                  return next;
                                });
                              }}
                            />
                            {h.hub_name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="settings-row" style={{ marginTop: "8px" }}>
                    <button
                      className="btn-secondary"
                      onClick={handleSavePublicProfile}
                      disabled={!props.hasActiveHub}
                      title={!props.hasActiveHub ? "Switch to a hub to publish your profile" : undefined}
                    >
                      Save
                    </button>
                    {!props.hasActiveHub && (
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        Select an active hub to publish
                      </span>
                    )}
                    {props.hasActiveHub && saveStatus === "saved" && (
                      <span className="muted">Saved</span>
                    )}
                    {props.hasActiveHub && saveStatus !== "idle" && saveStatus !== "saved" && (
                      <span style={{ color: "var(--color-error, red)" }}>{saveStatus}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
        {props.tab === "appearance" && (
          <section>
            <h1>Appearance</h1>
            <div className="settings-section">
              <label className="settings-label">Theme</label>
              <p className="muted">
                How Wavvon looks. Pick whichever feels right — you can change
                it any time.
              </p>
              <ThemePicker value={props.theme} skin={props.skin} onChange={props.onThemeChange} />
              {props.theme === "custom" && (
                <SkinEditor skin={props.skin ?? makeSeed("calm")} onChange={props.onSkinChange} />
              )}
            </div>
            <SkinsGallery onImport={props.onImportSkin} />
            <div className="settings-section">
              <label className="settings-label" htmlFor="settings-language">Language</label>
              <div className="settings-row">
                <select id="settings-language" value={i18n.language} onChange={e => {
                  i18n.changeLanguage(e.target.value);
                  localStorage.setItem('wavvon_language', e.target.value);
                }}>
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>
            </div>
          </section>
        )}
        {props.tab === "voice" && (
          <section>
            <h1>Voice & Video</h1>
            <div className="settings-section">
              <div className="voice-devices-row">
                <div>
                  <label className="settings-label" htmlFor="settings-mic">Microphone</label>
                  <select
                    id="settings-mic"
                    value={props.voiceInputDevice}
                    onChange={(e) => props.onInputDeviceChange(e.target.value)}
                  >
                    <option value="">System default</option>
                    {props.audioInputs.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="settings-label" htmlFor="settings-speaker">Speaker</label>
                  <select
                    id="settings-speaker"
                    value={props.voiceOutputDevice}
                    onChange={(e) => props.onOutputDeviceChange(e.target.value)}
                  >
                    <option value="">System default</option>
                    {props.audioOutputs.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">
                Mic sensitivity — threshold {props.vadThreshold.toFixed(3)}
              </label>
              <p className="muted">
                Drag the marker. Voice is detected when the green bar crosses
                it. Fill animates only while you're in voice or running a mic
                test. Changes apply on the next voice channel you join.
              </p>
              <MicLevelMeter
                level={props.micLevel}
                threshold={props.vadThreshold}
                onChange={props.onVadChange}
              />
              <div className="voice-mic-test">
                <button onClick={props.onToggleMicTest} className="btn-secondary">
                  {props.micTesting ? "Stop test" : "Start mic test"}
                </button>
                <span className="muted voice-mic-test-hint">
                  Plays your mic back through your speaker. Use headphones to avoid feedback.
                </span>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Activation mode</label>
              <p className="muted">
                Voice activity (VAD) opens the mic when it detects speech.
                Push-to-talk keeps it muted until you hold the bound key.
              </p>
              <div className="settings-row">
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="voice-mode"
                    checked={props.voiceMode === "vad"}
                    onChange={() => props.onVoiceModeChange("vad")}
                  />
                  Voice activity (VAD)
                </label>
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="voice-mode"
                    checked={props.voiceMode === "ptt"}
                    onChange={() => props.onVoiceModeChange("ptt")}
                  />
                  Push-to-talk
                </label>
              </div>
              {props.voiceMode === "ptt" && (
                <PttKeyBinder
                  value={props.pttKey}
                  onChange={props.onPttKeyChange}
                />
              )}
            </div>
            <div className="settings-section">
              <label className="settings-label">Notification sound</label>
              <p className="muted">
                Plays a short sound when you receive a notification — mentions,
                replies, or activity in channels you follow.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={props.mentionPingEnabled}
                  onChange={(e) => props.onMentionPingChange(e.target.checked)}
                />
                Play notification sound
              </label>
            </div>
          </section>
        )}
        {props.tab === "security" && (
          <section>
            <h1>Security</h1>
            <div className="settings-section">
              <label className="settings-label">Recovery phrase</label>
              <p className="muted">
                24 words you can use to restore your identity. Write them down
                and keep them safe — anyone with these words can impersonate
                you.
              </p>
              {props.recoveryPhrase ? (
                <div className="recovery-phrase">{props.recoveryPhrase}</div>
              ) : (
                <button onClick={props.onShowRecovery} className="btn-secondary">
                  Reveal recovery phrase
                </button>
              )}
            </div>
            <RestoreIdentitySection onRestore={props.onRecoverIdentity} />
            <IdentityBackupSection
              onExportBackup={props.onExportBackup}
              onImportBackup={props.onImportBackup}
            />
          </section>
        )}
        {props.tab === "privacy" && (
          <section>
            <h1>Privacy</h1>
            <BlockIgnoreSection
              blocks={props.blockedEntries}
              ignores={props.ignoredEntries}
              onUnblock={props.onUnblock}
              onUnignore={props.onUnignore}
              knownNames={{}}
            />
          </section>
        )}
        {props.tab === "notifications" && (
          <section>
            <h1>Notifications</h1>
            <DndSection dnd={props.dnd} onChange={props.onDndChange} />
          </section>
        )}
        {props.tab === "devices" && (
          <section>
            <h1>Devices</h1>
            <h2>Home Hubs</h2>
            <p className="muted">
              These hubs store your device list, DMs, and preferences. DMs are
              delivered to each hub in order.
            </p>
            <HomeHubSection hubs={props.hubs} />
            <h2>Device Pairing</h2>
            <p className="muted">
              Link this device to your identity on another machine, or allow a
              new device to join using your existing identity.
            </p>
            <PairingSection hubs={props.hubs} />
          </section>
        )}
        {props.tab === "about" && (
          <section>
            <h1>About</h1>
            <p className="muted">
              Wavvon — decentralized voice chat + community platform.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
