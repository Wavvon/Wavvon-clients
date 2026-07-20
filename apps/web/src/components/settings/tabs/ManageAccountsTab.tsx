import { useTranslation } from "react-i18next";
import type { Hub } from "@shared/types";
import type { BackupAccount } from "@wavvon/core";
import { IdentityBackupSection, type IdentityBackupSectionActions } from "@wavvon/ui";
import { formatPubkey } from "@wavvon/core";
import { FullArchiveSection } from "@components/admin/FullArchiveSection";
import { HomeHubsSection } from "../HomeHubsSection";
import { AccountsSwitcherSection } from "../AccountsSwitcherSection";
import { ManagingAccountSelector } from "../ManagingAccountSelector";
import {
  listAccounts,
  resolveOrCreateAccount,
  switchAccount,
  SWITCH_BLOCKED_COOLDOWN,
  type IdentityRecord,
} from "@identity/index";
import type { PerAccountProps } from "@wavvon/ui";

interface Props extends PerAccountProps<IdentityRecord> {
  hubs: Hub[];
  publicKey: string | null;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  inVoice: boolean;
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickBackupFile(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".wavvon-backup,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}

// Everything about getting accounts on/off this device: the switcher table
// (create/switch/remove/rename/reorder), recovery phrase + identity backup
// (unified shared component, settings-ia.md §4a), full archive — all
// active-account-scoped — plus the home-hub list, which follows the managing
// selector like the Devices/Privacy tabs.
export function ManageAccountsTab(props: Props) {
  const { t } = useTranslation();
  const activeHubUrl = props.hubs.find((h) => h.is_active)?.hub_url;

  // switchAccount refuses (voice guard, switch cooldown) rather than always
  // succeeding — the import already went through by this point, so surface
  // the refusal via alert() rather than silently staying on the old account.
  function switchOrAlert(accountId: string) {
    const refused = switchAccount(accountId, "settings-account");
    if (refused) {
      alert(refused === SWITCH_BLOCKED_COOLDOWN ? t("settings.account.accounts.switch_cooldown") : refused);
    }
  }

  async function importAccount(account: BackupAccount): Promise<{ isNew: boolean }> {
    const priorAccounts = await listAccounts();
    const hadAnyAccountBefore = priorAccounts.length > 0;
    const { account: record, isNew } = await resolveOrCreateAccount(account.secret_key_hex, {
      account_label: account.label,
    });
    if (!isNew) return { isNew: false };
    if (!hadAnyAccountBefore) {
      switchOrAlert(record.id);
    } else if (confirm(t("settings.account.identity_backup.import_switch_confirm", { label: account.label }))) {
      switchOrAlert(record.id);
    }
    return { isNew: true };
  }

  const backupActions: IdentityBackupSectionActions = {
    saveFile: downloadBytes,
    pickFile: pickBackupFile,
    importAccount,
  };
  const backupAccounts = (props.accounts ?? []).map((a) => ({
    id: a.id,
    label: a.account_label || formatPubkey(a.id),
    secretKeyHex: a.seed_hex,
  }));

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.accounts")}</h1>
      <AccountsSwitcherSection inVoice={props.inVoice} />
      <IdentityBackupSection
        accounts={backupAccounts}
        recoveryPhrase={props.recoveryPhrase}
        onRevealPhrase={props.onShowRecovery}
        actions={backupActions}
      />
      <FullArchiveSection publicKey={props.publicKey} />
      {props.accounts && props.managing && (
        <ManagingAccountSelector
          accounts={props.accounts}
          activeId={props.activeId}
          selectedId={props.managing.id}
          onChange={props.onManagingChange}
        />
      )}
      {props.managing && <HomeHubsSection activeHubUrl={activeHubUrl} account={props.managing} />}
    </section>
  );
}
