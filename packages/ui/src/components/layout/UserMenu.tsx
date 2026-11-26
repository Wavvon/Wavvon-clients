import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import { Avatar } from "../Avatar";
import type { PresenceStatus } from "../../utils/presenceExpiry";
import { ICON } from "./userMenuIcons";

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
  /** Opens the personal Saved list. */
  onOpenSaved?: () => void;
  /** Reminders that came due and wait in the Saved list. */
  savedDueCount?: number;
}

const STATUSES: PresenceStatus[] = ["online", "away", "dnd", "invisible"];
const STATUS_HINT: Partial<Record<PresenceStatus, string>> = {
  dnd: "presence.dnd_hint",
  invisible: "presence.invisible_hint",
};

const SECTIONS = [
  { tab: "accounts", key: "user_menu.account_backup", device: false },
  { tab: "devices", key: "settings.tabs.devices", device: false },
  { tab: "privacy", key: "user_menu.privacy", device: false },
  { tab: "notifications", key: "settings.tabs.notifications", device: true },
  { tab: "appearance", key: "settings.tabs.appearance", device: true },
  { tab: "voice", key: "user_menu.voice_camera", device: true },
] as const;

function Glyph({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

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
      if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setStatusOpen(false); }
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

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("user_menu.open", { name: p.name })}
        onClick={() => { setOpen((v) => !v); setStatusOpen(false); }}
      >
        <Avatar src={p.avatar} name={p.name} pubkey={p.publicKey} size={32} self />
        <span className={`user-status-dot status-${p.status}`} />
        {p.settingsNeedsAttention && <span className="gear-attention-dot" aria-label={t("settings.identity_backup.badge")} />}
      </button>

      {open && (
        <div className="user-menu-panel" role="menu" ref={menuRef} onKeyDown={onKeyDown} aria-label={t("user_menu.label")}>
          <div className="user-menu-header">
            <span className="user-menu-avatar">
              <Avatar src={p.avatar} name={p.name} pubkey={p.publicKey} size={48} self />
              <span className={`user-status-dot status-${p.status}`} />
            </span>
            <div className="user-menu-who">
              <span className="user-menu-name">{p.name}</span>
              {p.publicKey && <span className="user-menu-key">{formatPubkey(p.publicKey)}</span>}
            </div>
            <button type="button" role="menuitem" className="user-menu-profile" onClick={() => act(() => p.onOpenSettings("profile"))}>
              {t("user_menu.profile")}
            </button>
          </div>

          <div className="user-menu-group">
            <button
              type="button"
              role="menuitem"
              className={`user-menu-item${statusOpen ? " open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={statusOpen}
              onClick={() => setStatusOpen((v) => !v)}
            >
              <span className={`user-status-dot status-${p.status}`} />
              <span className="user-menu-item-label">{t(`presence.${p.status}`)}</span>
              <Glyph d={ICON.back} size={14} className="user-menu-chev" />
            </button>
            <form
              className="user-menu-custom"
              onSubmit={(e) => { e.preventDefault(); p.onSetCustomStatus(custom); }}
            >
              <Glyph d={ICON.smile} />
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
          </div>

          <div className="user-menu-sep" role="separator" />
          <div className="user-menu-group">
            {p.onOpenSaved && (
              <button type="button" role="menuitem" className="user-menu-item" onClick={() => act(p.onOpenSaved!)}>
                <Glyph d={ICON.saved} className="user-menu-icon" />
                <span className="user-menu-item-label">{t("saved.title")}</span>
                {(p.savedDueCount ?? 0) > 0 && <span className="hub-unread-pill mention">{p.savedDueCount}</span>}
              </button>
            )}
            {SECTIONS.map((s) => (
              <button key={s.tab} type="button" role="menuitem" className="user-menu-item" onClick={() => act(() => p.onOpenSettings(s.tab))}>
                <Glyph d={ICON[s.tab]} className="user-menu-icon" />
                <span className="user-menu-item-label">{t(s.key)}</span>
                {s.tab === "accounts" && p.settingsNeedsAttention && (
                  <>
                    <span className="user-menu-attention">{t("user_menu.backup_now")}</span>
                    <span className="settings-nav-dot" aria-label={t("settings.identity_backup.badge")} />
                  </>
                )}
                {s.device && <span className="user-menu-hint">{t("user_menu.this_device")}</span>}
              </button>
            ))}
          </div>

          {p.accounts && p.onSwitchAccount && (
            <>
              <div className="user-menu-sep" role="separator" />
              <div className="user-menu-group">
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
                    <Avatar name={a.name} pubkey={a.id} size={24} self={a.active} />
                    <span className="user-menu-item-label">{a.name}</span>
                    {a.active && <Glyph d={ICON.check} size={16} className="user-menu-check" />}
                  </button>
                ))}
                {p.onAddAccount && (
                  <button type="button" role="menuitem" className="user-menu-item muted" onClick={() => act(p.onAddAccount!)}>
                    <Glyph d={ICON.plus} />
                    {t("user_menu.add_account")}
                  </button>
                )}
              </div>
            </>
          )}

          <div className="user-menu-sep" role="separator" />
          <div className="user-menu-footer">
            <button type="button" role="menuitem" className="user-menu-link" onClick={() => act(() => p.onOpenSettings("help"))}>{t("user_menu.help")}</button>
            <button type="button" role="menuitem" className="user-menu-link" onClick={() => act(() => p.onOpenSettings("about"))}>{t("user_menu.about")}</button>
            {p.onOpenShortcuts && (
              <button type="button" role="menuitem" className="user-menu-link end" onClick={() => act(p.onOpenShortcuts!)}>
                {t("user_menu.shortcuts")} <kbd>Ctrl /</kbd>
              </button>
            )}
          </div>

          {statusOpen && (
            <div className="user-menu-status" role="group" aria-label={t("user_menu.status")}>
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
                  <span className="user-menu-item-label">
                    <span>{t(`presence.${s}`)}</span>
                    {STATUS_HINT[s] && <span className="user-menu-sub-hint">{t(STATUS_HINT[s]!)}</span>}
                  </span>
                  {p.status === s && <Glyph d={ICON.check} size={15} className="user-menu-check" />}
                </button>
              ))}
              <div className="user-menu-sep" role="separator" />
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
        </div>
      )}
    </div>
  );
}
