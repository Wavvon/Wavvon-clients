import { useEffect, useState } from "react";
import { AccountList, SettingRow, useConfirm } from "@wavvon/ui";
import { identityNeedsBackup } from "../utils/identityBackup";
import { useTranslation } from "react-i18next";
import {
  listAccounts,
  createAccount,
  removeAccount,
  renameAccount,
  reorderAccounts,
  switchAccountGuarded,
  SWITCH_BLOCKED_COOLDOWN,
  type AccountSummary,
} from "../accounts/store";

// The accounts on this device, drawn by the shared AccountList and wired
// straight into the Rust accounts.rs commands.
export function AccountSwitcherSection() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      setAccounts(await listAccounts());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Bringing an existing identity here from its phrase is the Restore
  // section's job, which also notices an account already on this device.
  async function handleCreate() {
    setBusyId("__create__");
    setError(null);
    try {
      await createAccount({});
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSwitch(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const refusal = await switchAccountGuarded(id);
      if (refusal === SWITCH_BLOCKED_COOLDOWN) {
        setError(t("settings.account.accounts.switch_cooldown"));
      } else if (refusal) {
        setError(refusal);
      } else {
        await refresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(account: AccountSummary) {
    const unsaved = identityNeedsBackup(account);
    const body = unsaved
      ? `${t("settings.account.accounts.remove_unsaved_warning")} ${t("settings.account.accounts.remove_unsaved_save_first")}`
      : `${t("settings.account.accounts.remove_body")} ${t(account.kind === "paired" ? "settings.account.accounts.remove_paired_hint" : "settings.account.accounts.remove_backed_up_hint")}`;
    const confirmed = await confirm({
      title: t("settings.account.accounts.remove_title", { label: account.label ?? account.id.slice(0, 12) }),
      body,
      confirmLabel: t(unsaved ? "settings.account.accounts.remove_anyway" : "settings.account.accounts.remove"),
      danger: true,
    });
    if (!confirmed) return;
    setBusyId(account.id);
    setError(null);
    try {
      await removeAccount(account.id);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  // Renaming edits in place rather than through a prompt: `window.prompt`
  // is the same untranslatable native chrome `window.confirm` was.
  async function handleRename(account: AccountSummary, next: string) {
    setBusyId(account.id);
    setError(null);
    try {
      await renameAccount(account.id, next);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SettingRow
      title={t("settings.account.accounts.label")}
      state={loading
        ? t("modal.loading")
        : (accounts.find((a) => a.is_active)?.label ?? t("settings.account.accounts.active_button"))}
      meta={accounts.length > 1 ? String(accounts.length) : undefined}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      {dialog}
      <p className="muted">{t("settings.account.accounts.hint")}</p>
      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted">{t("modal.loading")}</p>
      ) : (
        <AccountList
          accounts={accounts.map((a) => ({ id: a.id, label: a.label ?? null, publicKey: a.id, active: a.is_active }))}
          onSwitch={(id) => void handleSwitch(id)}
          onRename={(id, label) => { const acc = accounts.find((x) => x.id === id); if (acc) void handleRename(acc, label); }}
          onRemove={(id) => { const acc = accounts.find((x) => x.id === id); if (acc) void handleRemove(acc); }}
          onReorder={(ids) => { void reorderAccounts(ids).then(setAccounts).catch((e) => setError(String(e))); }}
        />
      )}
      <div className="settings-row" style={{ marginTop: 8 }}>
        <button onClick={() => handleCreate()} disabled={busyId === "__create__"}>
          {t("settings.account.accounts.new_identity")}
        </button>
      </div>
    </SettingRow>
  );
}
