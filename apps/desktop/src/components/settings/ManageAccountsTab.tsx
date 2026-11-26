import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FullArchiveSection,
  IdentityBackupSection,
  RecoveryContactsSection,
  SettingRow,
  type RecoveryContactsSectionActions,
  type RecoveryContactItem,
  type RecoveryRequestBundle,
} from "@wavvon/ui";
import type { AccountSummary } from "../../accounts/store";
import { buildRecoveryActions } from "../../utils/recoveryActions";
import { buildFullArchiveActions } from "../../utils/fullArchiveActions";
import { identityNeedsBackup } from "../../utils/identityBackup";
import { AccountSwitcherSection } from "../AccountSwitcherSection";
import { HomeHubSection } from "../HomeHubSection";
import { FindableDirectorySection } from "../FindableDirectorySection";
import { DISCOVERY_URL } from "../../constants";
import type { Hub } from "../../types";

interface Props {
  hubs: Hub[];
  activeHubUrl: string;
  isAdmin: boolean;
  accounts: AccountSummary[];
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  onClearLocalData: () => void;
  onBackedUp: () => void;
}

interface RecoveryContactsResponse {
  owner_pubkey: string;
  contacts: RecoveryContactItem[];
  threshold: number;
}

// Everything about getting accounts on/off this device: the switcher table,
// recovery phrase + identity backup and full archive (shared components, going
// through Rust commands so the secret key never enters the renderer), recovery
// contacts, and the home-hub list.
export function ManageAccountsTab({ hubs, activeHubUrl, isAdmin, accounts, recoveryPhrase, onShowRecovery, onClearLocalData, onBackedUp }: Props) {
  const { t } = useTranslation();

  const recoveryActions = buildRecoveryActions(activeHubUrl);
  const activeHubId = hubs.find((h) => h.is_active)?.hub_id ?? null;

  const [localDataOpen, setLocalDataOpen] = useState(false);

  return (
    <section>
      <h1>{t("settings.tabs.accounts")}</h1>
      <AccountSwitcherSection onBackedUp={onBackedUp} />
      <IdentityBackupSection
        recoveryPhrase={recoveryPhrase}
        onRevealPhrase={onShowRecovery}
        needsBackup={identityNeedsBackup(accounts.find((a) => a.is_active))}
      />
      {activeHubUrl && <RecoveryContactsSection isAdmin={isAdmin} actions={recoveryActions} />}
      <FullArchiveSection
        canExport={!!activeHubUrl}
        actions={buildFullArchiveActions(t("settings.account.full_archive.file_filter"), t("settings.account.accounts.switch_cooldown"))}
      />
      <HomeHubSection hubs={hubs} />
      {DISCOVERY_URL && <FindableDirectorySection directoryUrl={DISCOVERY_URL} />}
      <SettingRow
        title={t("settings.account.local_data.label")}
        state={t("settings.account.local_data.state")}
        open={localDataOpen}
        onToggle={() => setLocalDataOpen((v) => !v)}
      >
        <p className="muted">{t("settings.account.local_data.hint")}</p>
        <button className="btn-small danger" onClick={onClearLocalData}>
          {t("settings.account.local_data.button")}
        </button>
      </SettingRow>
    </section>
  );
}
