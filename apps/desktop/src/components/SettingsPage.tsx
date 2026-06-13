import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { BackgroundMode } from "../utils/backgroundProcessor";
import type { Hub, NamedProfile } from "../types";
import { formatPubkey } from "@voxply/core";
import { AudioProfileSection } from "./AudioProfileSection";
import { MicLevelMeter } from "./MicLevelMeter";
import { PttKeyBinder } from "./PttKeyBinder";
import { ThemePicker } from "./ThemePicker";
import { SkinEditor, makeSeed } from "./SkinEditor";
import { SkinsGallery } from "./SkinsGallery";
import type { ThemeId, VoxplySkin } from "../skinValidation";
import { ProfileTab } from "./ProfileTab";
import { RestoreIdentitySection } from "./RestoreIdentitySection";
import { PairingSection } from "./PairingSection";
import { HomeHubSection } from "./HomeHubSection";
import { IdentityBackupSection } from "./IdentityBackupSection";
import { RecoveryContactsSection } from "./RecoveryContactsSection";
import { IdentityCertificationsSection } from "./IdentityCertificationsSection";
import { DeviceListSection } from "./DeviceListSection";
import type { BlockEntry, IgnoreEntry } from "../types";
import { BlockIgnoreSection } from "@voxply/ui";

export type SettingsTab =
  | "profile"
  | "account"
  | "appearance"
  | "voice"
  | "security"
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
  skin: VoxplySkin | null;
  onSkinChange: (skin: VoxplySkin) => void;
  hasActiveHub: boolean;
  activeHubUrl: string;
  publicKey: string | null;
  copiedKey: boolean;
  onCopyKey: () => void;
  audioInputs: string[];
  audioOutputs: string[];
  voiceInputDevice: string;
  voiceOutputDevice: string;
  onInputDeviceChange: (v: string) => void;
  onOutputDeviceChange: (v: string) => void;
  mediaOutputDevices: { deviceId: string; label: string }[];
  mediaOutputDeviceId: string;
  onMediaOutputDeviceChange: (id: string) => void;
  vadThreshold: number;
  onVadChange: (v: number) => void;
  voiceMode: "vad" | "ptt";
  onVoiceModeChange: (m: "vad" | "ptt") => void;
  pttKey: string;
  onPttKeyChange: (k: string) => void;
  audioProfile: "standard" | "music" | "custom";
  onAudioProfileChange: (p: "standard" | "music" | "custom") => void;
  customBitrate: number | null;
  onCustomBitrateChange: (v: number | null) => void;
  customApp: "voip" | "audio" | "lowdelay";
  onCustomAppChange: (v: "voip" | "audio" | "lowdelay") => void;
  customNoiseSuppress: boolean;
  onCustomNoiseSuppressChange: (v: boolean) => void;
  customVad: boolean;
  onCustomVadChange: (v: boolean) => void;
  customVadThreshold: number;
  onCustomVadThresholdChange: (v: number) => void;
  customChannels: 1 | 2;
  onCustomChannelsChange: (v: 1 | 2) => void;
  customFrameMs: 20 | 40 | 60;
  onCustomFrameMsChange: (v: 20 | 40 | 60) => void;
  customComplexity: number;
  onCustomComplexityChange: (v: number) => void;
  inVoice: boolean;
  mentionPingEnabled: boolean;
  onMentionPingChange: (v: boolean) => void;
  micLevel: number;
  micTesting: boolean;
  onToggleMicTest: () => void;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  onRecoverIdentity: (phrase: string) => Promise<void>;
  onClearLocalData: () => void;
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  backgroundMode: BackgroundMode;
  onChangeBackground: (mode: BackgroundMode) => void;
  onImportSkin: (skin: VoxplySkin) => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const { t, i18n } = useTranslation();
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
    { id: "profile", label: t("settings.tabs.profile") },
    { id: "account", label: t("settings.tabs.account") },
    { id: "appearance", label: t("settings.tabs.appearance") },
    { id: "voice", label: t("settings.tabs.voice") },
    { id: "security", label: t("settings.tabs.security") },
    { id: "devices", label: t("settings.tabs.devices") },
    { id: "about", label: t("settings.tabs.about") },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>{t("settings.title")}</h2>
        <ul>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                className={`settings-nav-item ${props.tab === tab.id ? "active" : ""}`}
                onClick={() => props.onTab(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={props.onClose}>
          {t("settings.close")}
        </button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title={t("modal.close")}>
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
            <h1>{t("settings.tabs.account")}</h1>
            <div className="settings-section">
              <label className="settings-label">{t("settings.account.pubkey.label")}</label>
              <p className="muted">
                {t("settings.account.pubkey.hint")}
              </p>
              <div className="settings-row">
                <code className="pubkey-display" title={props.publicKey ?? ""}>
                  {formatPubkey(props.publicKey)}
                </code>
                <button onClick={props.onCopyKey}>
                  {props.copiedKey ? t("settings.account.pubkey.copied") : t("settings.account.pubkey.copy")}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("settings.account.local_data.label")}</label>
              <p className="muted">
                {t("settings.account.local_data.hint")}
              </p>
              <button
                className="btn-secondary"
                onClick={props.onClearLocalData}
              >
                {t("settings.account.local_data.button")}
              </button>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("settings.account.public_profile.label")}</label>
              <p className="muted">
                {t("settings.account.public_profile.hint")}
              </p>
              {props.hubs.length === 0 ? (
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  {t("settings.account.public_profile.join_first")}
                </p>
              ) : (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={publicProfileEnabled}
                      onChange={(e) => setPublicProfileEnabled(e.target.checked)}
                    />
                    {t("settings.account.public_profile.make_public")}
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
                      title={!props.hasActiveHub ? t("settings.account.public_profile.switch_hub") : undefined}
                    >
                      {t("settings.account.public_profile.save")}
                    </button>
                    {!props.hasActiveHub && (
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {t("settings.account.public_profile.select_hub")}
                      </span>
                    )}
                    {props.hasActiveHub && saveStatus === "saved" && (
                      <span className="muted">{t("settings.account.public_profile.saved")}</span>
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
            <h1>{t("settings.tabs.appearance")}</h1>
            <div className="settings-section">
              <label className="settings-label">{t("settings.theme.label")}</label>
              <p className="muted">
                {t("settings.theme.hint")}
              </p>
              <ThemePicker value={props.theme} skin={props.skin} onChange={props.onThemeChange} />
            </div>
            {props.theme === "custom" && (
              <SkinEditor
                skin={props.skin ?? makeSeed("calm")}
                onChange={props.onSkinChange}
              />
            )}
            <SkinsGallery onImport={props.onImportSkin} />
            <div className="settings-section">
              <label className="settings-label" htmlFor="settings-language">{t("settings.language.label")}</label>
              <div className="settings-row">
                <select id="settings-language" value={i18n.language} onChange={e => {
                  i18n.changeLanguage(e.target.value);
                  localStorage.setItem('voxply_language', e.target.value);
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
            <h1>{t("settings.tabs.voice")}</h1>
            <AudioProfileSection
              profile={props.audioProfile}
              onProfile={props.onAudioProfileChange}
              customBitrate={props.customBitrate}
              onCustomBitrate={props.onCustomBitrateChange}
              customApp={props.customApp}
              onCustomApp={props.onCustomAppChange}
              customNoiseSuppress={props.customNoiseSuppress}
              onCustomNoiseSuppress={props.onCustomNoiseSuppressChange}
              customVad={props.customVad}
              onCustomVad={props.onCustomVadChange}
              customVadThreshold={props.customVadThreshold}
              onCustomVadThreshold={props.onCustomVadThresholdChange}
              customChannels={props.customChannels}
              onCustomChannels={props.onCustomChannelsChange}
              customFrameMs={props.customFrameMs}
              onCustomFrameMs={props.onCustomFrameMsChange}
              customComplexity={props.customComplexity}
              onCustomComplexity={props.onCustomComplexityChange}
              inVoice={props.inVoice}
            />
            <div className="settings-section">
              <div className="voice-devices-row">
                <div>
                  <label className="settings-label" htmlFor="settings-mic">{t("settings.voice.microphone")}</label>
                  <select
                    id="settings-mic"
                    value={props.voiceInputDevice}
                    onChange={(e) => props.onInputDeviceChange(e.target.value)}
                  >
                    <option value="">{t("settings.voice.system_default")}</option>
                    {props.audioInputs.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="settings-label" htmlFor="settings-speaker">{t("settings.voice.speaker")}</label>
                  <select
                    id="settings-speaker"
                    value={props.voiceOutputDevice}
                    onChange={(e) => props.onOutputDeviceChange(e.target.value)}
                  >
                    <option value="">{t("settings.voice.system_default")}</option>
                    {props.audioOutputs.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              {props.mediaOutputDevices.length > 0 && (
                <div className="voice-devices-row" style={{ marginTop: "var(--space-3)" }}>
                  <div>
                    <label className="settings-label" htmlFor="settings-media-speaker">{t("settings.voice.media_speaker", "Screen share audio output")}</label>
                    <select
                      id="settings-media-speaker"
                      value={props.mediaOutputDeviceId}
                      onChange={(e) => props.onMediaOutputDeviceChange(e.target.value)}
                    >
                      <option value="">{t("settings.voice.system_default")}</option>
                      {props.mediaOutputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="settings-section">
              <label className="settings-label">
                {t("settings.voice.sensitivity.label", { value: props.vadThreshold.toFixed(3) })}
              </label>
              <p className="muted">
                {t("settings.voice.sensitivity.hint")}
              </p>
              <MicLevelMeter
                level={props.micLevel}
                threshold={props.vadThreshold}
                onChange={props.onVadChange}
              />
              <div className="voice-mic-test">
                <button onClick={props.onToggleMicTest} className="btn-secondary">
                  {props.micTesting ? t("settings.voice.mic_test.stop") : t("settings.voice.mic_test.start")}
                </button>
                <span className="muted voice-mic-test-hint">
                  {t("settings.voice.mic_test.hint")}
                </span>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Camera background</label>
              <div className="settings-row" style={{ gap: "var(--space-2)" }}>
                <button
                  className={`btn-secondary${props.backgroundMode === "none" ? " active" : ""}`}
                  onClick={() => props.onChangeBackground("none")}
                >
                  None
                </button>
                <button
                  className={`btn-secondary${props.backgroundMode === "blur" ? " active" : ""}`}
                  onClick={() => props.onChangeBackground("blur")}
                >
                  Blur
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("settings.voice.mode.label")}</label>
              <p className="muted">
                {t("settings.voice.mode.hint")}
              </p>
              <div className="settings-row">
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="voice-mode"
                    checked={props.voiceMode === "vad"}
                    onChange={() => props.onVoiceModeChange("vad")}
                  />
                  {t("settings.voice.mode.vad")}
                </label>
                <label className="checkbox-label">
                  <input
                    type="radio"
                    name="voice-mode"
                    checked={props.voiceMode === "ptt"}
                    onChange={() => props.onVoiceModeChange("ptt")}
                  />
                  {t("settings.voice.mode.ptt")}
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
              <label className="settings-label">{t("settings.voice.notify_sound.label")}</label>
              <p className="muted">
                {t("settings.voice.notify_sound.hint")}
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={props.mentionPingEnabled}
                  onChange={(e) => props.onMentionPingChange(e.target.checked)}
                />
                {t("settings.voice.notify_sound.enable")}
              </label>
            </div>
          </section>
        )}
        {props.tab === "security" && (
          <section>
            <h1>{t("settings.tabs.security")}</h1>
            <div className="settings-section">
              <label className="settings-label">{t("settings.security.recovery.label")}</label>
              <p className="muted">
                {t("settings.security.recovery.hint")}
              </p>
              {props.recoveryPhrase ? (
                <div className="recovery-phrase">{props.recoveryPhrase}</div>
              ) : (
                <button onClick={props.onShowRecovery} className="btn-secondary">
                  {t("settings.security.recovery.reveal")}
                </button>
              )}
            </div>
            <IdentityBackupSection />
            <RestoreIdentitySection onRestore={props.onRecoverIdentity} />
            {props.hasActiveHub && (
              <RecoveryContactsSection activeHubUrl={props.activeHubUrl} />
            )}
            <IdentityCertificationsSection />
            <BlockIgnoreSection
              blocks={props.blocks}
              ignores={props.ignores}
              onUnblock={props.onUnblock}
              onUnignore={props.onUnignore}
              knownNames={props.knownNames}
            />
          </section>
        )}
        {props.tab === "devices" && (
          <section>
            <h1>{t("settings.tabs.devices")}</h1>
            <h2>Linked devices</h2>
            <DeviceListSection />
            <h2>{t("settings.devices.home_hubs.title")}</h2>
            <p className="muted">
              {t("settings.devices.home_hubs.hint")}
            </p>
            <HomeHubSection hubs={props.hubs} />
            <h2>{t("settings.devices.pairing.title")}</h2>
            <p className="muted">
              {t("settings.devices.pairing.hint")}
            </p>
            <PairingSection hubs={props.hubs} />
          </section>
        )}
        {props.tab === "about" && (
          <section>
            <h1>{t("settings.tabs.about")}</h1>
            <p className="muted">
              {t("settings.about.description")}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
