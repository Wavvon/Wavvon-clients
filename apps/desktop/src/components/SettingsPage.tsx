import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BackgroundMode } from "../utils/backgroundProcessor";
import type { Hub } from "../types";
import { AudioProfileSection } from "./AudioProfileSection";
import { MicLevelMeter } from "./MicLevelMeter";
import { PttKeyBinder } from "./PttKeyBinder";
import { ThemePicker } from "./ThemePicker";
import {
  SkinEditor,
  makeSeed,
  SkinsGallery,
  ProfileTab,
  SettingsShell,
  resolveManagingAccount,
  type ThemeId,
  type WavvonSkin,
  type SettingsTabDef,
  type PerAccountProps,
  type ProfileAccountRef,
} from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { listAccounts, type AccountSummary } from "../accounts/store";
import { buildProfileEditorActions, loadDefaultProfileAsync } from "../utils/profileEditorActions";
import { ManageAccountsTab } from "./settings/ManageAccountsTab";
import { DevicesTab } from "./settings/DevicesTab";
import { PrivacyTab } from "./settings/PrivacyTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { CameraTab } from "./settings/CameraTab";
import type { BlockEntry, IgnoreEntry } from "../types";

export type SettingsTab =
  | "profile"
  | "accounts"
  | "devices"
  | "privacy"
  | "notifications"
  | "appearance"
  | "voice"
  | "camera";

export interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];

  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: WavvonSkin | null;
  onSkinChange: (skin: WavvonSkin) => void;
  activeHubId: string | null;
  activeHubUrl: string;
  isAdmin: boolean;
  publicKey: string | null;
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
  hideBirthdays: boolean;
  onToggleHideBirthdays: () => void;
  backgroundMode: BackgroundMode;
  backgroundSource: string | null;
  backgroundActive: boolean | null;
  onChangeBackground: (mode: BackgroundMode, source?: string | null) => void;
  onImportSkin: (skin: WavvonSkin) => void;
  videoInputs: { deviceId: string; label: string }[];
  videoInputDevice: string;
  onVideoInputDeviceChange: (v: string) => void;
}

function toProfileAccountRef(a: AccountSummary): ProfileAccountRef {
  return { id: a.id, account_label: a.label ?? undefined };
}

export function SettingsPage(props: SettingsPageProps) {
  const { t, i18n } = useTranslation();

  // Desktop's own multi-account list, for the shared ProfileTab's account
  // scope line — Devices/Privacy stay active-account-only for now (see
  // DevicesTab/PrivacyTab comments), so they don't need this.
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const activeId = accounts?.find((a) => a.is_active)?.id ?? null;

  useEffect(() => {
    listAccounts()
      .then((list) => {
        setAccounts(list);
        setManagingId((prev) => prev ?? list.find((a) => a.is_active)?.id ?? list[0]?.id ?? null);
      })
      .catch(() => setAccounts([]));
    // Warms profileEditorActions' default-profile cache so ProfileTab's
    // first render already has it (loadDefaultProfile is synchronous).
    void loadDefaultProfileAsync();
  }, []);

  const profileAccounts = useMemo(() => accounts?.map(toProfileAccountRef) ?? null, [accounts]);
  const managing = resolveManagingAccount(profileAccounts, managingId, activeId);
  const perAccount: PerAccountProps<ProfileAccountRef> = {
    accounts: profileAccounts,
    activeId,
    managing,
    onManagingChange: setManagingId,
  };
  const profileEditorActions = useMemo(() => buildProfileEditorActions(props.hubs), [props.hubs]);

  const G_ACCOUNTS = t("settings.nav_groups.accounts");
  const G_APP = t("settings.nav_groups.app");
  const G_AV = t("settings.nav_groups.audio_video");
  const TABS: SettingsTabDef<SettingsTab>[] = [
    { id: "profile", label: t("settings.tabs.profile"), group: G_ACCOUNTS },
    { id: "accounts", label: t("settings.tabs.accounts"), group: G_ACCOUNTS },
    { id: "devices", label: t("settings.tabs.devices"), group: G_ACCOUNTS },
    { id: "privacy", label: t("settings.tabs.privacy"), group: G_ACCOUNTS },
    { id: "notifications", label: t("settings.tabs.notifications"), group: G_APP },
    { id: "appearance", label: t("settings.tabs.appearance"), group: G_APP },
    { id: "voice", label: t("settings.tabs.voice"), group: G_AV },
    { id: "camera", label: t("settings.tabs.camera"), group: G_AV },
  ];

  return (
    <SettingsShell title={t("settings.title")} tabs={TABS} activeTab={props.tab} onTab={props.onTab} onClose={props.onClose}>
        {props.tab === "profile" && (
          <ProfileTab
            hubs={props.hubs}
            publicKey={props.publicKey}
            actions={profileEditorActions}
            {...perAccount}
          />
        )}

        {props.tab === "accounts" && accounts && (
          <ManageAccountsTab
            hubs={props.hubs}
            activeHubUrl={props.activeHubUrl}
            isAdmin={props.isAdmin}
            accounts={accounts}
            recoveryPhrase={props.recoveryPhrase}
            onShowRecovery={props.onShowRecovery}
            onRecoverIdentity={props.onRecoverIdentity}
            onClearLocalData={props.onClearLocalData}
          />
        )}

        {props.tab === "devices" && (
          <DevicesTab hubs={props.hubs} activeHubId={props.activeHubId} />
        )}

        {props.tab === "privacy" && (
          <PrivacyTab
            blocks={props.blocks}
            ignores={props.ignores}
            onUnblock={props.onUnblock}
            onUnignore={props.onUnignore}
            knownNames={props.knownNames}
            hideBirthdays={props.hideBirthdays}
            onToggleHideBirthdays={props.onToggleHideBirthdays}
          />
        )}

        {props.tab === "notifications" && (
          <NotificationsTab
            mentionPingEnabled={props.mentionPingEnabled}
            onMentionPingChange={props.onMentionPingChange}
          />
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
            <SkinsGallery fetchWithTimeout={fetchWithTimeout} onImport={props.onImportSkin} />
            <div className="settings-section">
              <label className="settings-label" htmlFor="settings-language">{t("settings.language.label")}</label>
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
            {/* About folded in here rather than its own tab (settings-ia.md
                piece 4) — a static footnote doesn't need a nav slot. */}
            <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 24 }}>
              {t("settings.about.description")}
            </p>
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
          </section>
        )}

        {props.tab === "camera" && (
          <CameraTab
            backgroundMode={props.backgroundMode}
            backgroundSource={props.backgroundSource}
            backgroundActive={props.backgroundActive}
            onChangeBackground={props.onChangeBackground}
            videoInputs={props.videoInputs}
            videoInputDevice={props.videoInputDevice}
            onVideoInputDeviceChange={props.onVideoInputDeviceChange}
          />
        )}
    </SettingsShell>
  );
}
