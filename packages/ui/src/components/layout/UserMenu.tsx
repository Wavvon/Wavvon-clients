import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import { Avatar } from "../Avatar";
import type { PresenceStatus } from "../../utils/presenceExpiry";

export interface MenuAccount {
  id: string;
  name: string;
  active: boolean;
}

export interface UserMenuProps {
  name: string;
  publicKey: string | null;
  avatar?: string | null;
  status: PresenceStatus;
  customStatus: string | null;
  onSetStatus: (status: PresenceStatus, ttlMinutes: number | null) => void;
  onSetCustomStatus: (text: string) => void;
  /** Opens settings on a tab id: profile, accounts, devices, privacy,
   *  notifications, appearance, voice, help, about. */
  onOpenSettings: (tab: string) => void;
  /** The account has no backup yet: marked on the trigger and its entry. */
  settingsNeedsAttention?: boolean;
  accounts?: MenuAccount[];
  onSwitchAccount?: (id: string) => void;
  onAddAccount?: () => void;
  onOpenShortcuts?: () => void;
}

const STATUSES: PresenceStatus[] = ["online", "away", "dnd", "invisible"];
const SECTIONS = [
  { tab: "accounts", key: "user_menu.account_backup", device: false },
  { tab: "devices", key: "settings.tabs.devices", device: false },
  { tab: "privacy", key: "settings.tabs.privacy", device: false },
  { tab: "notifications", key: "settings.tabs.notifications", device: true },
  { tab: "appearance", key: "settings.tabs.appearance", device: true },
  { tab: "voice", key: "user_menu.voice_camera", device: true },
] as const;

/** The member's own menu, opened from their avatar. */
export function UserMenu(p: UserMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ttl, setTtl] = useState(0);
  const [custom, setCustom] = useState(p.customStatus ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setCustom(p.customStatus ?? ""); }, [p.customStatus]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')?.focus();
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close() {
    setOpen(false);
    setStatusOpen(false);
    triggerRef.current?.focus();
  }

  function act(fn: () => void) {
    fn();
    close();
  }

  // Arrow keys walk the items in document order; Esc closes and returns focus.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    if ((e.target as HTMLElement).tagName === "INPUT" && (e.key === "Home" || e.key === "End")) return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], input') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1
      : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  const statusLabel = t(`presence.${p.status}`);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("user_menu.open", { name: p.name })}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar src={p.avatar} name={p.name} pubkey={p.publicKey} size={28} />
        <span className={`user-status-dot status-${p.status}`} />
        {p.settingsNeedsAttention && <span className="gear-attention-dot" aria-label={t("settings.identity_backup.badge")} />}
      </button>

      {open && (
        <div className="user-menu-panel" role="menu" ref={menuRef} onKeyDown={onKeyDown} aria-label={t("user_menu.label")}>
          <div className="user-menu-header">
            <Avatar src={p.avatar} name={p.name} pubkey={p.publicKey} size={40} />
            <div className="user-menu-who">
              <span className="user-menu-name">{p.name}</span>
              {p.publicKey && <span className="user-menu-key">{formatPubkey(p.publicKey)}</span>}
            </div>
            <button type="button" role="menuitem" className="btn-secondary btn-small" onClick={() => act(() => p.onOpenSettings("profile"))}>
              {t("user_menu.profile")}
            </button>
          </div>

          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            aria-haspopup="menu"
            aria-expanded={statusOpen}
            onClick={() => setStatusOpen((v) => !v)}
          >
            <span className={`user-status-dot status-${p.status}`} />
            {statusLabel}
          </button>
          {statusOpen && (
            <div className="user-menu-sub" role="group" aria-label={t("user_menu.status")}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={p.status === s}
                  className="user-menu-item"
                  onClick={() => act(() => p.onSetStatus(s, s === "online" || ttl === 0 ? null : ttl))}
                >
                  <span className={`user-status-dot status-${s}`} />
                  {t(`presence.${s}`)}
                </button>
              ))}
              <label className="status-menu-ttl">
                <span>{t("presence.clear_after")}</span>
                <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
                  <option value={0}>{t("presence.ttl.off")}</option>
                  <option value={30}>{t("presence.ttl.30m")}</option>
                  <option value={60}>{t("presence.ttl.1h")}</option>
                  <option value={180}>{t("presence.ttl.3h")}</option>
                </select>
              </label>
            </div>
          )}
          <form
            className="user-menu-custom"
            onSubmit={(e) => { e.preventDefault(); p.onSetCustomStatus(custom); }}
          >
            <input
              type="text"
              value={custom}
              maxLength={128}
              placeholder={t("presence.custom_placeholder")}
              aria-label={t("presence.custom_placeholder")}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => { if (custom.trim() !== (p.customStatus ?? "")) p.onSetCustomStatus(custom); }}
            />
          </form>

          <div className="user-menu-sep" role="separator" />
          {SECTIONS.map((s) => (
            <button key={s.tab} type="button" role="menuitem" className="user-menu-item" onClick={() => act(() => p.onOpenSettings(s.tab))}>
              <span className="user-menu-item-label">{t(s.key)}</span>
              {s.tab === "accounts" && p.settingsNeedsAttention && <span className="settings-nav-dot" aria-label={t("settings.identity_backup.badge")} />}
              {s.device && <span className="user-menu-hint">{t("user_menu.this_device")}</span>}
            </button>
          ))}

          {p.accounts && p.onSwitchAccount && (
            <>
              <div className="user-menu-sep" role="separator" />
              <span className="user-menu-heading">{t("user_menu.accounts")}</span>
              {p.accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={a.active}
                  className="user-menu-item"
                  onClick={() => act(() => { if (!a.active) p.onSwitchAccount!(a.id); })}
                >
                  {a.name}
                </button>
              ))}
              {p.onAddAccount && (
                <button type="button" role="menuitem" className="user-menu-item" onClick={() => act(p.onAddAccount!)}>
                  {t("user_menu.add_account")}
                </button>
              )}
            </>
          )}

          <div className="user-menu-sep" role="separator" />
          <div className="user-menu-footer">
            <button type="button" role="menuitem" className="user-menu-link" onClick={() => act(() => p.onOpenSettings("help"))}>{t("settings.tabs.help")}</button>
            <button type="button" role="menuitem" className="user-menu-link" onClick={() => act(() => p.onOpenSettings("about"))}>{t("settings.tabs.about")}</button>
            {p.onOpenShortcuts && (
              <button type="button" role="menuitem" className="user-menu-link" onClick={() => act(p.onOpenShortcuts!)}>{t("user_menu.shortcuts")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
