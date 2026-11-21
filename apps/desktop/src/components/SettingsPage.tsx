import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub } from "../types";
import { AudioProfileSection } from "./AudioProfileSection";
import { MicLevelMeter } from "./MicLevelMeter";
import { PttKeyBinder } from "./PttKeyBinder";
import { DISCOVERY_URL } from "../constants";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  ThemesGallery,
  ThemesSection,
  HelpTab,
  AboutTab,
  ProfileTab,
  SettingsShell,
  SettingsAccountPicker,
  ActiveAccountOnlyNotice,
  SettingRow,
  LanguageSetting,
  resolveManagingAccount,
  type ThemesController,
  TrustedIssuersTab,
  knownIssuerHubs,
  userSettingsLayout,
  type UserSettingsSection,
  type PerAccountProps,
  type ProfileAccountRef,
} from "@wavvon/ui";
import { listAccounts, switchAccountGuarded, SWITCH_BLOCKED_COOLDOWN, type AccountSummary } from "../accounts/store";
import { buildProfileEditorActions, loadDefaultProfileAsync } from "../utils/profileEditorActions";
import { ManageAccountsTab } from "./settings/ManageAccountsTab";
import { identityNeedsBackup } from "../utils/identityBackup";
import { loadTrustRoots, saveTrustRoots } from "../utils/trustRoots";
import { addTrustRoot, CameraTab, type TrustRoot } from "@wavvon/ui";
import { DevicesTab } from "./settings/DevicesTab";
import { PrivacyTab } from "./settings/PrivacyTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { lookupIssuerHub } from "../hooks/hubAdminActions";
import type { BlockEntry, IgnoreEntry } from "../types";

export type SettingsTab = UserSettingsSection;

export interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  /** A hub-context profile was saved; refresh what the hub now reports. */
  onHubProfileSaved?: (hubId: string) => void;
  onClose: () => void;
  hubs: Hub[];

  themes: ThemesController;
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
  onCustomVadThresholdChange: (v: number) => void;  customFrameMs: 20 | 40 | 60;
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
}

function toProfileAccountRef(a: AccountSummary): ProfileAccountRef {
  return { id: a.id, account_label: a.label ?? undefined };
}

export function SettingsPage(props: SettingsPageProps) {
  const { t } = useTranslation();

  // Desktop's own multi-account list, for the shared ProfileTab's account
  // scope line — Devices/Privacy stay active-account-only for now (see
  // DevicesTab/PrivacyTab comments), so they don't need this.
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const settingRow = (id: string) => ({
    open: openRow === id,
    onToggle: () => setOpenRow((cur) => (cur === id ? null : id)),
  });
  const activeId = accounts?.find((a) => a.is_active)?.id ?? null;
  // Bumped when a backup is exported, so the tab marker clears at once;
  // revealing the phrase already re-renders through the recoveryPhrase prop.
  const [, setBackupTick] = useState(0);
  const accountsAttention = identityNeedsBackup(accounts?.find((a) => a.is_active))
    ? t("settings.identity_backup.badge")
    : undefined;

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

  // Loaded per account, so switching identity switches whom you believe.
  const [trustRoots, setTrustRoots] = useState<TrustRoot[]>([]);
  useEffect(() => setTrustRoots(loadTrustRoots(activeId)), [activeId]);
  function updateTrustRoots(roots: TrustRoot[]) {
    setTrustRoots(roots);
    saveTrustRoots(activeId, roots);
  }

  const { areas, sections } = userSettingsLayout(t, accountsAttention);

  function renderSection(section: SettingsTab) {
    return (
      <>
        {/* Desktop's Manage accounts, Devices and Privacy act on the active
            account only (their Tauri commands are scoped to it), so picking
            another account says so, once at the top of each of their pages. */}
        {managing && managing.id !== activeId && (section === "accounts" || section === "privacy") && (
          <ActiveAccountOnlyNotice
            label={managing.account_label || managing.id.slice(0, 12)}
            onSwitch={() => {
              void switchAccountGuarded(managing.id).then((refused) => {
                if (refused) alert(refused === SWITCH_BLOCKED_COOLDOWN ? t("settings.account.accounts.switch_cooldown") : refused);
              });
            }}
          />
        )}
        {section === "profile" && (
          <ProfileTab
            hubs={props.hubs}
            publicKey={props.publicKey}
            actions={profileEditorActions}
            onHubProfileSaved={props.onHubProfileSaved}
            trustRoots={trustRoots}
            onTrustIssuer={(pubkey, label) => updateTrustRoots(addTrustRoot(trustRoots, pubkey, label))}
            showBirthdays={!props.hideBirthdays}
            onShowBirthdaysChange={(show) => {
              if (show === props.hideBirthdays) props.onToggleHideBirthdays();
            }}
            {...perAccount}
          />
        )}

        {section === "trusted" && (
          <TrustedIssuersTab
            roots={trustRoots}
            onChange={updateTrustRoots}
            joinedHubs={knownIssuerHubs(props.hubs, [])}
            lookupHub={lookupIssuerHub}
          />
        )}

        {section === "accounts" && accounts && (
          <ManageAccountsTab
            hubs={props.hubs}
            activeHubUrl={props.activeHubUrl}
            isAdmin={props.isAdmin}
            accounts={accounts}
            recoveryPhrase={props.recoveryPhrase}
            onShowRecovery={props.onShowRecovery}
            onRecoverIdentity={props.onRecoverIdentity}
            onClearLocalData={props.onClearLocalData}
            onBackedUp={() => setBackupTick((n) => n + 1)}
          />
        )}

        {section === "devices" && (
          <DevicesTab hubs={props.hubs} />
        )}

        {section === "privacy" && (
          <PrivacyTab
            blocks={props.blocks}
            ignores={props.ignores}
            onUnblock={props.onUnblock}
            onUnignore={props.onUnignore}
            knownNames={props.knownNames}
          />
        )}

        {section === "notifications" && (
          <NotificationsTab
            mentionPingEnabled={props.mentionPingEnabled}
            onMentionPingChange={props.onMentionPingChange}
          />
        )}

        {section === "appearance" && (
          <section>
            <h1>{t("settings.tabs.appearance")}</h1>

            <LanguageSetting {...settingRow("language")} />

            <SettingRow
              title={t("settings.theme.label")}
              state={props.themes.active?.manifest.name ?? t("settings.theme.builtin")}
              {...settingRow("theme")}
            >
              <p className="muted">{t("settings.theme.hint")}</p>
              <ThemesSection controller={props.themes} />
            </SettingRow>

            {/* Not a row: the gallery renders nothing when the directory is
                unreachable, and a row that opens onto nothing is worse than none. */}
            {DISCOVERY_URL && (
              <ThemesGallery controller={props.themes} fetchWithTimeout={fetchWithTimeout} discoveryUrl={DISCOVERY_URL} />
            )}

            {/* About folded in here rather than its own tab (settings-ia.md
                piece 4) — a static footnote doesn't need a nav slot. */}
            <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 24 }}>
              {t("settings.about.description")}
            </p>
          </section>
        )}

        {section === "voice" && (
          <section>
            <h1>{t("settings.tabs.voice")}</h1>

            <SettingRow
              title={t("settings.voice.devices.label")}
              state={props.voiceInputDevice || t("settings.voice.system_default")}
              {...settingRow("devices")}
            >
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
            </SettingRow>

            <SettingRow
              title={t("settings.voice.vad.sensitivity")}
              state={props.vadThreshold.toFixed(3)}
              {...settingRow("sensitivity")}
            >
              <p className="muted">{t("settings.voice.sensitivity.hint")}</p>
              <MicLevelMeter
                level={props.micLevel}
                threshold={props.vadThreshold}
                onChange={props.onVadChange}
              />
              <div className="voice-mic-test">
                <button onClick={props.onToggleMicTest} className="btn-small">
                  {props.micTesting ? t("settings.voice.mic_test.stop") : t("settings.voice.mic_test.start")}
                </button>
                <span className="muted voice-mic-test-hint">
                  {t("settings.voice.mic_test.hint")}
                </span>
              </div>
            </SettingRow>

            <SettingRow
              title={t("settings.voice.mode.label")}
              state={t(`settings.voice.mode.${props.voiceMode}`)}
              {...settingRow("mode")}
            >
              <p className="muted">{t("settings.voice.mode.hint")}</p>
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
            </SettingRow>

            <SettingRow
              title={t("settings.voice.quality.label")}
              state={t(`settings.voice.quality.${props.audioProfile}`)}
              {...settingRow("quality")}
            >
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
                onCustomVadThreshold={props.onCustomVadThresholdChange}                customFrameMs={props.customFrameMs}
                onCustomFrameMs={props.onCustomFrameMsChange}
                customComplexity={props.customComplexity}
                onCustomComplexity={props.onCustomComplexityChange}
                inVoice={props.inVoice}
              />
            </SettingRow>
          </section>
        )}

        {section === "help" && <HelpTab />}
        {section === "about" && (
          <AboutTab version={import.meta.env.VITE_APP_VERSION} extraCredits={["Tauri", "Opus", "RNNoise (nnnoiseless)", "cpal", "wtransport"]} />
        )}

        {section === "camera" && <CameraTab />}
      </>
    );
  }

  return (
    <SettingsShell
      title={t("settings.title")}
      areas={areas}
      sections={sections}
      activeSection={props.tab}
      onSection={props.onTab}
      renderSection={renderSection}
      helpSection="help"
      onClose={props.onClose}
      accountPicker={profileAccounts && profileAccounts.length > 1 && managing ? (
        <SettingsAccountPicker accounts={profileAccounts} activeId={activeId} selectedId={managing.id} onChange={setManagingId} />
      ) : undefined}
    />
  );
}
