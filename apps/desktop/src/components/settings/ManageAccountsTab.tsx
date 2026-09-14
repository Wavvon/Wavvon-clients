import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import {
  IdentityBackupSection,
  RecoveryContactsSection,
  type IdentityBackupSectionActions,
  type RecoveryContactsSectionActions,
  type RecoveryContactItem,
  type RecoveryRequestBundle,
} from "@wavvon/ui";
import { suggestBackupFilename } from "@wavvon/core";
import type { AccountSummary } from "../../accounts/store";
import { buildRecoveryActions } from "../../utils/recoveryActions";
import { isIdentityBackedUp, markIdentityBackedUp } from "../../utils/identityBackup";
import { AccountSwitcherSection } from "../AccountSwitcherSection";
import { HomeHubSection } from "../HomeHubSection";
import { RestoreIdentitySection } from "../RestoreIdentitySection";
import type { Hub } from "../../types";

interface Props {
  hubs: Hub[];
  activeHubUrl: string;
  isAdmin: boolean;
  accounts: AccountSummary[];
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  onRecoverIdentity: (phrase: string) => Promise<void>;
  onClearLocalData: () => void;
}

interface RecoveryContactsResponse {
  owner_pubkey: string;
  contacts: RecoveryContactItem[];
  threshold: number;
}

interface ImportedAccount {
  id: string;
  is_new: boolean;
}

// Everything about getting accounts on/off this device: the switcher table,
// recovery phrase + identity backup (unified shared component, going through
// Rust's export_account_backup/import_account_backup so the secret key never
// enters the renderer), recovery contacts, and the home-hub list.
export function ManageAccountsTab({ hubs, activeHubUrl, isAdmin, accounts, recoveryPhrase, onShowRecovery, onRecoverIdentity, onClearLocalData }: Props) {
  const { t } = useTranslation();

  const recoveryActions = buildRecoveryActions(activeHubUrl);

  const backupAccounts = accounts
    .filter((a) => a.kind === "owned")
    .map((a) => ({ id: a.id, label: a.label || a.id }));

  const backupActions: IdentityBackupSectionActions = {
    async exportToPath(accountId, passphrase) {
      const path = await save({
        defaultPath: suggestBackupFilename(backupAccounts.find((a) => a.id === accountId)?.label ?? accountId),
        filters: [{ name: t("settings.account.identity_backup.file_filter"), extensions: ["wavvon-backup"] }],
      });
      if (!path) throw new Error("export_cancelled");
      await invoke("export_account_backup", { id: accountId, passphrase, path });
    },
    async pickImportPath() {
      const path = await open({
        multiple: false,
        filters: [{ name: t("settings.account.identity_backup.file_filter"), extensions: ["wavvon-backup"] }],
      });
      return typeof path === "string" ? path : null;
    },
    async importFromPath(path, passphrase) {
      const result = await invoke<ImportedAccount>("import_account_backup", { path, passphrase });
      return { isNew: result.is_new };
    },
  };

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.accounts")}</h1>
      <AccountSwitcherSection />
      <IdentityBackupSection
        accounts={backupAccounts}
        recoveryPhrase={recoveryPhrase}
        onRevealPhrase={onShowRecovery}
        actions={backupActions}
        needsBackup={!isIdentityBackedUp(accounts.find((a) => a.is_active)?.id)}
        onSavedOffDevice={markIdentityBackedUp}
      />
      <RestoreIdentitySection onRestore={onRecoverIdentity} />
      {activeHubUrl && <RecoveryContactsSection isAdmin={isAdmin} actions={recoveryActions} />}
      <HomeHubSection hubs={hubs} />
      <div className="settings-section">
        <label className="settings-label">{t("settings.account.local_data.label")}</label>
        <p className="muted">{t("settings.account.local_data.hint")}</p>
        <button className="btn-secondary" onClick={onClearLocalData}>
          {t("settings.account.local_data.button")}
        </button>
      </div>
    </section>
  );
}
