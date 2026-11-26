import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import { Avatar } from "../Avatar";
import { EditIcon, TrashIcon } from "../Icons";

export interface AccountListItem {
  id: string;
  label: string | null;
  /** The key to show and copy: the identity hubs know this account by. */
  publicKey: string;
  active: boolean;
  /** Holds its master seed, so an exported file restores this identity (a
   *  paired device holds a subkey, which would restore a different one). */
  exportable: boolean;
}

export interface AccountListProps {
  accounts: AccountListItem[];
  /** Why switching is refused right now (in voice, cooling down), or null. */
  switchBlockedReason?: string | null;
  onSwitch: (id: string) => void;
  /** Opens the export to an encrypted backup file. */
  onExport: (id: string) => void;
  onRename: (id: string, label: string) => void;
  /** Asks the app to remove the account; the app owns the confirmation. */
  onRemove: (id: string) => void;
  /** The new order, every id; the list is drawn in the order given. */
  onReorder: (ids: string[]) => void;
}

/**
 * The accounts on this device, one row each: who it is (avatar, name, the
 * key hubs know it by), whether it is the active one, and what can be done
 * with it. Rows drag to reorder, or move with Alt+Up/Down.
 */
export function AccountList({ accounts, switchBlockedReason, onSwitch, onExport, onRename, onRemove, onReorder }: AccountListProps) {
  const { t } = useTranslation();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ids = accounts.map((a) => a.id);

  function move(from: string, to: string) {
    if (from === to) return;
    const next = ids.filter((id) => id !== from);
    next.splice(next.indexOf(to) + (ids.indexOf(from) < ids.indexOf(to) ? 1 : 0), 0, from);
    onReorder(next);
  }

  function step(id: string, by: -1 | 1) {
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    move(id, ids[j]);
  }

  function copy(a: AccountListItem) {
    navigator.clipboard.writeText(a.publicKey).catch(() => {});
    setCopiedId(a.id);
    setTimeout(() => setCopiedId((v) => (v === a.id ? null : v)), 2000);
  }

  function commitRename(a: AccountListItem) {
    const label = draft.trim().slice(0, 48);
    setRenamingId(null);
    if (label && label !== (a.label ?? "")) onRename(a.id, label);
  }

  return (
    <ul className="account-list" aria-label={t("settings.account.accounts.label")}>
      {accounts.map((a) => {
        const name = a.label || formatPubkey(a.publicKey);
        return (
          <li
            key={a.id}
            className={`account-list-row${a.active ? " active" : ""}${dragId === a.id ? " dragging" : ""}${overId === a.id && dragId && dragId !== a.id ? " drop-target" : ""}`}
            draggable={renamingId !== a.id}
            tabIndex={0}
            title={t("settings.account.accounts.reorder_hint")}
            onDragStart={() => setDragId(a.id)}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e) => { e.preventDefault(); if (overId !== a.id) setOverId(a.id); }}
            onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, a.id); setDragId(null); setOverId(null); }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || !e.altKey) return;
              if (e.key === "ArrowUp") { e.preventDefault(); step(a.id, -1); }
              if (e.key === "ArrowDown") { e.preventDefault(); step(a.id, 1); }
            }}
          >
            <Avatar name={name} pubkey={a.publicKey} size={36} self={a.active} />
            <div className="account-list-who">
              {renamingId === a.id ? (
                <input
                  type="text"
                  autoFocus
                  value={draft}
                  maxLength={48}
                  placeholder={t("settings.account.accounts.rename_placeholder")}
                  aria-label={t("settings.account.accounts.rename_title")}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(a)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(a);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span className="account-list-name">
                  {name}
                  {a.active && <span className="account-list-active">{t("settings.account.accounts.active_button")}</span>}
                </span>
              )}
              <button
                type="button"
                className="account-list-key"
                title={t("settings.account.accounts.key_click_to_copy")}
                onClick={() => copy(a)}
              >
                {copiedId === a.id ? t("settings.account.pubkey.copied") : formatPubkey(a.publicKey)}
              </button>
            </div>
            <div className="account-list-actions">
              {!a.active && (
                <button
                  type="button"
                  className="account-list-switch"
                  disabled={!!switchBlockedReason}
                  title={switchBlockedReason ?? undefined}
                  onClick={() => onSwitch(a.id)}
                >
                  {t("settings.account.accounts.switch")}
                </button>
              )}
              {a.exportable && (
                <button
                  type="button"
                  className="account-list-switch"
                  title={t("settings.account.identity_backup.export_hint")}
                  onClick={() => onExport(a.id)}
                >
                  {t("settings.account.identity_backup.export_button")}
                </button>
              )}
              <button
                type="button"
                className="btn-icon"
                title={t("settings.account.accounts.rename_button")}
                aria-label={t("settings.account.accounts.rename_label", { name })}
                onClick={() => { setRenamingId(a.id); setDraft(a.label ?? ""); }}
              >
                <EditIcon size={15} />
              </button>
              <button
                type="button"
                className="btn-icon danger"
                disabled={accounts.length <= 1}
                title={accounts.length <= 1 ? t("settings.account.accounts.last_account_title") : t("settings.account.accounts.remove")}
                aria-label={t("settings.account.accounts.remove_label", { name })}
                onClick={() => onRemove(a.id)}
              >
                <TrashIcon size={15} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
