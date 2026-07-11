import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import {
  listAccounts,
  getActiveAccountId,
  saveIdentity,
  removeAccount,
  switchAccount,
  type IdentityRecord,
} from "@identity/index";
import { IdentitySetupScreen } from "@components/identity/IdentitySetupScreen";

// Short, typeable identifier for the "type to confirm" removal guard — the
// formatted fingerprint (formatPubkey) contains an ellipsis and dashes that
// aren't practical to retype.
function shortFingerprint(id: string): string {
  return id.slice(0, 8);
}

// Accounts are device-local: this list is just every row in the identity
// store (see identity/store.ts) — there is no server-side account registry
// and nothing here is ever synced to a hub.
export function AccountsSwitcherSection() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<IdentityRecord[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeConfirmText, setRemoveConfirmText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  function refresh() {
    listAccounts().then(setAccounts);
    setActiveId(getActiveAccountId());
  }

  useEffect(() => {
    refresh();
  }, []);

  function startRename(account: IdentityRecord) {
    setRenamingId(account.id);
    setRenameDraft(account.account_label ?? "");
  }

  async function commitRename(account: IdentityRecord) {
    const label = renameDraft.trim().slice(0, 48);
    setRenamingId(null);
    if (label === (account.account_label ?? "")) return;
    await saveIdentity({ ...account, account_label: label || undefined });
    refresh();
  }

  function startRemove(id: string) {
    setRemovingId(id);
    setRemoveConfirmText("");
  }

  // Same value the old standalone "Your public key" section copied: the
  // canonical identity the hub attributes actions to, falling back to the
  // account's own pubkey for devices that were never paired.
  function copyKey(account: IdentityRecord) {
    const key = account.canonical_pubkey ?? account.id;
    navigator.clipboard.writeText(key).catch(() => {});
    setCopiedKeyId(account.id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  }

  async function confirmRemove(account: IdentityRecord) {
    if (removeConfirmText.trim().toLowerCase() !== shortFingerprint(account.id)) return;
    const wasActive = account.id === activeId;
    await removeAccount(account.id);
    setRemovingId(null);
    if (wasActive) {
      window.location.reload();
    } else {
      refresh();
    }
  }

  if (showAdd) {
    return (
      <div className="settings-section">
        <IdentitySetupScreen
          variant="add"
          onCancel={() => setShowAdd(false)}
          onComplete={({ accountId }) => switchAccount(accountId)}
        />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.account.accounts.label")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 4 }}>
        {t("settings.account.accounts.hint")}
      </p>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
        {t("settings.account.accounts.pubkey_hint")}
      </p>

      {(accounts ?? []).map((account) => {
        const isActive = account.id === activeId;
        const fp = shortFingerprint(account.id);
        return (
          <div
            key={account.id}
            className="settings-row"
            style={{ alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {renamingId === account.id ? (
                <input
                  type="text"
                  autoFocus
                  value={renameDraft}
                  placeholder={t("settings.account.accounts.rename_placeholder")}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => void commitRename(account)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRename(account);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  style={{ fontSize: "var(--text-sm)" }}
                />
              ) : (
                <>
                  <span style={{ fontWeight: isActive ? 600 : 400 }} title={account.id}>
                    {account.account_label || formatPubkey(account.id)}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => startRename(account)}
                    title={t("settings.account.accounts.rename_button")}
                    aria-label={t("settings.account.accounts.rename_button")}
                    style={{ padding: "2px 4px", fontSize: "var(--text-sm)", lineHeight: 1 }}
                  >
                    ✎
                  </button>
                </>
              )}
              {isActive && <span className="muted" style={{ fontSize: "var(--text-xs)" }}>({t("settings.account.accounts.active_badge")})</span>}
              {account.account_label && (
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{formatPubkey(account.id)}</span>
              )}
            </span>

            {removingId === account.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                <p className="error-text" style={{ margin: 0 }}>
                  {t("settings.account.accounts.remove_confirm_hint")}
                </p>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={removeConfirmText}
                    onChange={(e) => setRemoveConfirmText(e.target.value)}
                    placeholder={t("settings.account.accounts.remove_confirm_placeholder", { fingerprint: fp })}
                    style={{ fontFamily: "monospace" }}
                  />
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    disabled={removeConfirmText.trim().toLowerCase() !== fp}
                    onClick={() => void confirmRemove(account)}
                  >
                    {t("settings.account.accounts.remove_confirm_button")}
                  </button>
                  <button type="button" className="btn-small btn-secondary" onClick={() => setRemovingId(null)}>
                    {t("settings.account.accounts.remove_cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn-small btn-secondary"
                  onClick={() => copyKey(account)}
                  title={account.canonical_pubkey ?? account.id}
                >
                  {copiedKeyId === account.id ? t("settings.account.pubkey.copied") : t("settings.account.pubkey.copy")}
                </button>
                {!isActive && (
                  <button type="button" className="btn-small btn-secondary" onClick={() => switchAccount(account.id)}>
                    {t("settings.account.accounts.switch")}
                  </button>
                )}
                <button type="button" className="btn-small btn-secondary" onClick={() => startRemove(account.id)}>
                  {t("settings.account.accounts.remove")}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div className="settings-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={() => setShowAdd(true)}>
          {t("settings.account.accounts.add")}
        </button>
      </div>
    </div>
  );
}
