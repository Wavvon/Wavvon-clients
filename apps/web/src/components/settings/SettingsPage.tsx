import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub, BlockEntry, IgnoreEntry } from "@shared/types";
import type { ThemeId, WavvonSkin, ProfileEditorActions, SettingsTabDef } from "@wavvon/ui";
import { ProfileTab, resolveManagingAccount, SettingsShell } from "@wavvon/ui";
import type { NamedCustomTheme } from "@shared/utils/customThemes";
import { listAccountsOrdered, getActiveAccountId, onAccountsChanged, type IdentityRecord } from "@identity/index";
import { getMyProfileOnHub, updateMyProfileOnHub, NO_HUB_SESSION, listMyCertifications } from "@platform";
import { loadDefaultProfile, saveDefaultProfile, loadFollowsDefault, saveFollowsDefault } from "@shared/utils/profiles";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { CameraTab } from "./tabs/CameraTab";
import { ManageAccountsTab } from "./tabs/ManageAccountsTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { PrivacyTab } from "./tabs/PrivacyTab";

// Web's platform wiring for the shared ProfileEditorSection (packages/ui):
// hub sessions via @platform, the local default profile via
// @shared/utils/profiles. Built once — none of this depends on props.
const profileEditorActions: ProfileEditorActions = {
  getMyProfileOnHub,
  updateMyProfileOnHub,
  noHubSessionError: NO_HUB_SESSION,
  loadDefaultProfile: (accountId) => loadDefaultProfile(accountId),
  saveDefaultProfile: (profile, accountId) => saveDefaultProfile(profile, accountId),
  loadFollowsDefault: (accountId) => loadFollowsDefault(accountId),
  saveFollowsDefault: (hubIds, accountId) => saveFollowsDefault(hubIds, accountId),
  listMyCertifications,
};

export type SettingsTab =
  | "profile"
  | "accounts"
  | "devices"
  | "privacy"
  | "notifications"
  | "appearance"
  | "voice"
  | "camera";

interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];
  publicKey: string | null;
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: WavvonSkin | null;
  onSkinChange: (skin: WavvonSkin) => void;
  customThemes: NamedCustomTheme[];
  activeCustomThemeId: string | null;
  onApplyCustomTheme: (id: string) => void;
  onNewCustomTheme: () => void;
  onRenameCustomTheme: (id: string, name: string) => void;
  onDuplicateCustomTheme: (id: string) => void;
  onDeleteCustomTheme: (id: string) => void;
  onHubProfileSaved?: (hubId: string) => void;
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
  inVoice: boolean;
}

export function SettingsPage(props: SettingsPageProps) {
  const { t } = useTranslation();
  // Managing-account state is owned here, not per tab, so picking an account
  // in Profile carries over to Devices/Privacy instead of resetting on every
  // tab change. Ephemeral by design: remounts (and re-defaults to the active
  // account) whenever the account actually switches, since App keys off the
  // account id (AccountRoot.tsx).
  const activeId = getActiveAccountId();
  const [accounts, setAccounts] = useState<IdentityRecord[] | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      listAccountsOrdered().then((list) => {
        if (cancelled) return;
        setAccounts(list);
        setManagingId((prev) => prev ?? activeId ?? list[0]?.id ?? null);
      });
    }
    refresh();
    // Keeps the list (and every tab's managing-account dropdown) live while
    // Settings stays open — e.g. adding an account from the accounts tab
    // used to only show up after Settings was closed and reopened.
    const unsubscribe = onAccountsChanged(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const managing = resolveManagingAccount(accounts, managingId, activeId);
  const perAccount = { accounts, activeId, managing, onManagingChange: setManagingId };

  // Grouped into contiguous sections so the nav reads clearly, mirroring the
  // HubAdminPage nav pattern. "Accounts" holds everything identity-shaped:
  // who you are (profile), which accounts live on this device, what can act
  // as them (devices), and who they've blocked (privacy).
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
            onHubProfileSaved={props.onHubProfileSaved}
            actions={profileEditorActions}
            {...perAccount}
          />
        )}

        {props.tab === "accounts" && (
          <ManageAccountsTab
            hubs={props.hubs}
            publicKey={props.publicKey}
            recoveryPhrase={props.recoveryPhrase}
            onShowRecovery={props.onShowRecovery}
            inVoice={props.inVoice}
            {...perAccount}
          />
        )}

        {props.tab === "devices" && (
          <DevicesTab hubs={props.hubs} publicKey={props.publicKey} {...perAccount} />
        )}

        {props.tab === "privacy" && (
          <PrivacyTab
            blocks={props.blocks}
            ignores={props.ignores}
            onUnblock={props.onUnblock}
            onUnignore={props.onUnignore}
            knownNames={props.knownNames}
            {...perAccount}
          />
        )}

        {props.tab === "notifications" && (
          <NotificationsTab
            hubs={props.hubs}
            mentionPingEnabled={props.mentionPingEnabled}
            onMentionPingChange={props.onMentionPingChange}
          />
        )}

        {props.tab === "appearance" && (
          <AppearanceTab
            theme={props.theme}
            onThemeChange={props.onThemeChange}
            skin={props.skin}
            onSkinChange={props.onSkinChange}
            customThemes={props.customThemes}
            activeCustomThemeId={props.activeCustomThemeId}
            onApplyCustomTheme={props.onApplyCustomTheme}
            onNewCustomTheme={props.onNewCustomTheme}
            onRenameCustomTheme={props.onRenameCustomTheme}
            onDuplicateCustomTheme={props.onDuplicateCustomTheme}
            onDeleteCustomTheme={props.onDeleteCustomTheme}
            onImportSkin={props.onImportSkin}
          />
        )}

        {props.tab === "voice" && <VoiceTab />}

        {props.tab === "camera" && <CameraTab />}
    </SettingsShell>
  );
}
