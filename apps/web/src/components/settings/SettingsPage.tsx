import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub, BlockEntry } from "@shared/types";
import type { WebPush } from "../../hooks/useWebPush";
import type { ThemesController, TrustRoot, UserSettingsSection } from "@wavvon/ui";
import { AboutTab, CameraTab, HelpTab, ProfileTab, resolveManagingAccount, SettingsAccountPicker, SettingsShell, TrustedIssuersTab, knownIssuerHubs, userSettingsLayout } from "@wavvon/ui";
import { lookupIssuerHub } from "../../platform/adminActions";
import { listAccountsOrdered, getActiveAccountId, onAccountsChanged, type IdentityRecord } from "@identity/index";
import { profileEditorActions } from "../../utils/profileEditorActions";
import { addTrustRoot } from "@wavvon/ui";
import { loadTrustRoots, saveTrustRoots } from "@shared/utils/trustRoots";
import { identityNeedsBackup } from "../../utils/identityBackup";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { ManageAccountsTab } from "./tabs/ManageAccountsTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { PrivacyTab } from "./tabs/PrivacyTab";

export type SettingsTab = UserSettingsSection;

interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];
  publicKey: string | null;
  themes: ThemesController;
  onHubProfileSaved?: (hubId: string) => void;
  mentionPingEnabled?: boolean;
  onMentionPingChange?: (v: boolean) => void;
  webPush?: WebPush;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  blocks: BlockEntry[];
  onUnblock: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  hideBirthdays: boolean;
  onToggleHideBirthdays: () => void;
  inVoice: boolean;
}

export function SettingsPage(props: SettingsPageProps) {
  const { t } = useTranslation();
  // Trust roots are read in two tabs — Privacy edits the list, Profile marks
  // each badge with it — so the state is owned here rather than in either,
  // and an issuer trusted from a badge shows up in the list immediately.
  const [trustRoots, setTrustRoots] = useState<TrustRoot[]>(() => loadTrustRoots());
  function updateTrustRoots(next: TrustRoot[]) {
    setTrustRoots(next);
    saveTrustRoots(next);
  }
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

  // Bumped when a backup is exported, so the tab marker clears at once;
  // revealing the phrase already re-renders through the recoveryPhrase prop.
  const [, setBackupTick] = useState(0);
  const accountsAttention = identityNeedsBackup(accounts?.find((a) => a.id === activeId))
    ? t("settings.identity_backup.badge")
    : undefined;

  const managing = resolveManagingAccount(accounts, managingId, activeId);
  const perAccount = { accounts, activeId, managing, onManagingChange: setManagingId };

  const { areas, sections } = userSettingsLayout(t, accountsAttention);

  function renderSection(section: SettingsTab) {
    return (
      <>
        {section === "profile" && (
          <ProfileTab
            hubs={props.hubs}
            publicKey={props.publicKey}
            onHubProfileSaved={props.onHubProfileSaved}
            actions={profileEditorActions}
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

        {section === "accounts" && (
          <ManageAccountsTab
            hubs={props.hubs}
            publicKey={props.publicKey}
            recoveryPhrase={props.recoveryPhrase}
            onShowRecovery={props.onShowRecovery}
            inVoice={props.inVoice}
            onBackedUp={() => setBackupTick((n) => n + 1)}
            {...perAccount}
          />
        )}

        {section === "devices" && (
          <DevicesTab hubs={props.hubs} publicKey={props.publicKey} {...perAccount} />
        )}

        {section === "privacy" && (
          <PrivacyTab
            blocks={props.blocks}
            onUnblock={props.onUnblock}
            knownNames={props.knownNames}
            {...perAccount}
          />
        )}

        {section === "notifications" && (
          <NotificationsTab
            hubs={props.hubs}
            mentionPingEnabled={props.mentionPingEnabled}
            onMentionPingChange={props.onMentionPingChange}
            webPush={props.webPush}
          />
        )}

        {section === "appearance" && (
          <AppearanceTab themes={props.themes} />
        )}

        {section === "voice" && <VoiceTab />}

        {section === "camera" && <CameraTab />}

        {section === "help" && <HelpTab />}
        {section === "about" && <AboutTab version={import.meta.env.VITE_APP_VERSION} />}
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
      accountPicker={accounts && accounts.length > 1 && managing ? (
        <SettingsAccountPicker accounts={accounts} activeId={activeId} selectedId={managing.id} onChange={setManagingId} />
      ) : undefined}
    />
  );
}
