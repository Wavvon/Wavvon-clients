import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import {
  listAccountsOrdered,
  getActiveAccountId,
  saveIdentity,
  removeAccount,
  switchAccount,
  setAccountOrder,
  type IdentityRecord,
} from "@identity/index";
import { reorderByDrop, moveByStep } from "@identity/accountOrder";
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const handleRefs = useRef(new Map<string, HTMLSpanElement>());

  function refresh() {
    listAccountsOrdered().then(setAccounts);
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
    // Labels are mandatory going forward — clearing the field reverts to the
    // previous label instead of wiping it. Accounts created before this rule
    // existed can still be unlabeled and just keep showing their fingerprint.
    if (!label) return;
    if (label === (account.account_label ?? "")) return;
    await saveIdentity({ ...account, account_label: label });
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

  // Reorders the in-memory list immediately (so the drop/keystroke feels
  // instant) and writes the new positions to IndexedDB in the background.
  async function persistOrder(newIds: string[]) {
    const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
    const reordered = newIds.map((id) => byId.get(id)).filter((a): a is IdentityRecord => !!a);
    setAccounts(reordered);
    await setAccountOrder(newIds);
  }

  function handleDrop(targetId: string) {
    const sourceId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || !accounts) return;
    void persistOrder(reorderByDrop(accounts.map((a) => a.id), sourceId, targetId));
  }

  function handleHandleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (!accounts) return;
    const direction = e.key === "ArrowUp" ? -1 : 1;
    const newIds = moveByStep(accounts.map((a) => a.id), id, direction);
    void persistOrder(newIds).then(() => handleRefs.current.get(id)?.focus());
  }

  if (showAdd) {
    return (
      <div className="settings-section">
        <IdentitySetupScreen
          variant="add"
          onCancel={() => setShowAdd(false)}
          onComplete={() => {
            // Adding an account no longer switches to it automatically — it
            // just lands in the list below, unswitched, until the user picks
            // Switch on its row.
            setShowAdd(false);
            refresh();
          }}
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

      <table className="members-table" style={{ marginTop: 4 }}>
        <thead>
          <tr>
            <th className="account-order-col">{t("settings.account.accounts.col_order")}</th>
            <th>{t("settings.account.accounts.col_label")}</th>
            <th>{t("settings.account.accounts.col_key")}</th>
            <th>{t("settings.account.accounts.col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {(accounts ?? []).map((account, index) => {
            const isActive = account.id === activeId;
            const fp = shortFingerprint(account.id);
            const isRemoving = removingId === account.id;
            const label = account.account_label || formatPubkey(account.id);
            return (
              <Fragment key={account.id}>
                <tr
                  className={[
                    dragId === account.id ? "account-row-dragging" : "",
                    dragOverId === account.id && dragId && dragId !== account.id ? "account-drop-target" : "",
                  ].filter(Boolean).join(" ")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverId !== account.id) setDragOverId(account.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(account.id);
                  }}
                >
                  <td className="account-order-cell">
                    <span className="account-order-number">{index + 1}</span>
                    <span
                      ref={(el) => {
                        if (el) handleRefs.current.set(account.id, el);
                        else handleRefs.current.delete(account.id);
                      }}
                      className={`account-drag-handle ${dragId === account.id ? "dragging" : ""}`}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={() => setDragId(account.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      onKeyDown={(e) => handleHandleKeyDown(e, account.id)}
                      aria-label={t("settings.account.accounts.reorder_handle", { label })}
                      title={t("settings.account.accounts.reorder_hint")}
                    >
                      ⠿
                    </span>
                  </td>
                  <td>
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
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
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
                      </span>
                    )}
                  </td>
                  <td>
                    <code style={{ fontFamily: "monospace", fontSize: "var(--text-xs)" }} title={account.id}>
                      {formatPubkey(account.id)}
                    </code>
                  </td>
                  <td>
                    {!isRemoving && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn-small btn-secondary"
                          disabled={isActive}
                          title={isActive ? t("settings.account.accounts.active_hint") : undefined}
                          onClick={() => switchAccount(account.id)}
                        >
                          {isActive ? t("settings.account.accounts.active_button") : t("settings.account.accounts.switch")}
                        </button>
                        <button
                          type="button"
                          className="btn-small btn-secondary"
                          onClick={() => copyKey(account)}
                          title={account.canonical_pubkey ?? account.id}
                        >
                          {copiedKeyId === account.id ? t("settings.account.pubkey.copied") : t("settings.account.pubkey.copy")}
                        </button>
                        <button type="button" className="btn-small btn-secondary" onClick={() => startRemove(account.id)}>
                          {t("settings.account.accounts.remove")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {isRemoving && (
                  <tr>
                    <td colSpan={4}>
                      <p className="error-text" style={{ margin: 0 }}>
                        {t("settings.account.accounts.remove_confirm_hint")}
                      </p>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
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
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="settings-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn-secondary" onClick={() => setShowAdd(true)}>
          {t("settings.account.accounts.add")}
        </button>
      </div>
    </div>
  );
}
