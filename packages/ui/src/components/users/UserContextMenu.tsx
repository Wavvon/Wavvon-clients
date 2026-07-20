import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleInfo, User, PublicHubProfile } from "../../types";
import { formatPubkey } from "@wavvon/core";
import { safeRoleColor } from "../../utils/roleAppearance";

/** Platform-calling operations the roster context menu needs. Role
 * management and moderation are wired on both clients; the social actions
 * (`dm`/`addFriend`/`toggleBlock`/`toggleIgnore`) and the "their hubs" lookup
 * are desktop-only today — web reaches the same actions from Friends/Block
 * settings instead, so the menu simply omits the buttons when unset. */
export interface UserContextMenuActions {
  listRoles: () => Promise<RoleInfo[]>;
  listUserRoles: (pubkey: string) => Promise<RoleInfo[]>;
  assignRole: (pubkey: string, roleId: string) => Promise<void>;
  removeRole: (pubkey: string, roleId: string) => Promise<void>;
  muteUser: (pubkey: string) => Promise<void>;
  kickUser: (pubkey: string) => Promise<void>;
  banUser: (pubkey: string) => Promise<void>;
  dm?: (user: User) => void;
  addFriend?: (user: User) => void;
  toggleBlock?: (pubkey: string) => void;
  toggleIgnore?: (pubkey: string) => void;
  fetchPublicProfile?: (pubkey: string) => Promise<PublicHubProfile | null>;
  joinHub?: (hubUrl: string, inviteCode: string) => void;
}

interface Props {
  user: User;
  publicKey: string | null;
  isAdmin: boolean;
  /** Whether the viewer can manage roles (admin or manage_roles). Gates the roles section. */
  canManageRoles?: boolean;
  /** Highest priority among the viewer's own roles; only lower-priority roles are assignable (matches the hub guard). */
  myMaxPriority?: number;
  blockedUsers?: Set<string>;
  ignoredUsers?: Set<string>;
  position: { x: number; y: number };
  actions: UserContextMenuActions;
  onClose: () => void;
  onToast: (msg: string) => void;
  /** Called after a role is assigned/removed so the caller can refresh the member list. */
  onRolesChanged?: () => void;
}

export function UserContextMenu({
  user, publicKey, isAdmin, canManageRoles, myMaxPriority, blockedUsers, ignoredUsers,
  position, actions, onClose, onToast, onRolesChanged,
}: Props) {
  const { t } = useTranslation();
  const pubkey = user.public_key;
  const displayName = user.display_name;
  const menuRef = useRef<HTMLDivElement>(null);
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicHubProfile | null | "loading">(actions.fetchPublicProfile ? "loading" : null);
  const isSelf = pubkey === publicKey;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load the hub roles + this member's current roles when the viewer can
  // manage roles. Only roles below the viewer's own priority are assignable
  // (the hub rejects priority >= your own), and @everyone can't be granted.
  useEffect(() => {
    if (!canManageRoles) return;
    let cancelled = false;
    Promise.all([actions.listRoles(), actions.listUserRoles(pubkey)])
      .then(([all, mine]) => {
        if (cancelled) return;
        setRoles(all);
        setAssigned(new Set(mine.map((r) => r.id)));
      })
      .catch((e) => { if (!cancelled) onToast(`Failed to load roles: ${e}`); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageRoles, pubkey]);

  useEffect(() => {
    if (!actions.fetchPublicProfile) return;
    let cancelled = false;
    setProfile("loading");
    actions.fetchPublicProfile(pubkey)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]);

  // Clamp menu to viewport after render (re-run once roles arrive and grow it).
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${Math.max(0, position.x - rect.width)}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${Math.max(0, position.y - rect.height)}px`;
  }, [position, roles]);

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(pubkey);
      onToast("Public key copied");
    } catch {
      onToast("Copy failed");
    }
    onClose();
  }

  async function handleKick() {
    if (!confirm(`Kick ${displayName ?? formatPubkey(pubkey)}?`)) return;
    try {
      await actions.kickUser(pubkey);
      onToast("Kicked");
    } catch (e) {
      onToast(`Failed to kick: ${e}`);
    }
    onClose();
  }

  async function handleBan() {
    if (!confirm(`Ban ${displayName ?? formatPubkey(pubkey)}? They won't be able to rejoin.`)) return;
    try {
      await actions.banUser(pubkey);
      onToast("Banned");
    } catch (e) {
      onToast(`Failed to ban: ${e}`);
    }
    onClose();
  }

  async function handleMute() {
    try {
      await actions.muteUser(pubkey);
      onToast("Muted");
    } catch (e) {
      onToast(`Failed to mute: ${e}`);
    }
    onClose();
  }

  // Toggle a role without closing the menu (so several can be changed at once).
  async function toggleRole(role: RoleInfo) {
    if (busyRole) return;
    const has = assigned.has(role.id);
    setBusyRole(role.id);
    try {
      if (has) {
        await actions.removeRole(pubkey, role.id);
        setAssigned((prev) => { const n = new Set(prev); n.delete(role.id); return n; });
      } else {
        await actions.assignRole(pubkey, role.id);
        setAssigned((prev) => new Set(prev).add(role.id));
      }
      onRolesChanged?.();
    } catch (e) {
      onToast(`Failed to update role: ${e}`);
    } finally {
      setBusyRole(null);
    }
  }

  const assignableRoles = (roles ?? [])
    .filter((r) => r.id !== "builtin-everyone" && (myMaxPriority === undefined || r.priority < myMaxPriority))
    .sort((a, b) => b.priority - a.priority);

  return (
    <div
      className="context-menu-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
    >
      <div
        ref={menuRef}
        className="context-menu"
        style={{ position: "fixed", top: position.y, left: position.x, zIndex: 9999, maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="context-menu-header">
          {displayName || formatPubkey(pubkey)}
        </div>

        {!isSelf && actions.dm && (
          <button className="context-menu-item" onClick={() => { actions.dm!(user); onClose(); }}>
            {t("user.ctx.dm")}
          </button>
        )}
        {!isSelf && actions.addFriend && (
          <button className="context-menu-item" onClick={() => { actions.addFriend!(user); onClose(); }}>
            {t("user.ctx.add_friend")}
          </button>
        )}

        <button className="context-menu-item" onClick={handleCopyKey}>
          {t("user.ctx.copy_key")}
        </button>

        {!isSelf && actions.toggleIgnore && ignoredUsers && (
          <button
            className="context-menu-item"
            onClick={() => {
              const wasIgnored = ignoredUsers.has(pubkey);
              onClose();
              actions.toggleIgnore!(pubkey);
              onToast(wasIgnored ? t("user.ctx.unignore") : t("user.ctx.ignored_feedback"));
            }}
          >
            {ignoredUsers.has(pubkey) ? t("user.ctx.unignore") : t("user.ctx.ignore")}
          </button>
        )}
        {!isSelf && actions.toggleBlock && blockedUsers && (
          <button
            className="context-menu-item"
            onClick={() => {
              const wasBlocked = blockedUsers.has(pubkey);
              onClose();
              actions.toggleBlock!(pubkey);
              onToast(wasBlocked ? t("user.ctx.unblocked_feedback") : t("user.ctx.blocked_feedback"));
            }}
          >
            {blockedUsers.has(pubkey) ? t("user.ctx.unblock") : t("user.ctx.block")}
          </button>
        )}

        {canManageRoles && (
          <>
            <div className="context-menu-separator" />
            <div className="context-menu-header">Roles</div>
            {roles === null ? (
              <div className="context-menu-item muted">Loading roles…</div>
            ) : assignableRoles.length === 0 ? (
              <div className="context-menu-item muted">No assignable roles</div>
            ) : (
              assignableRoles.map((role) => {
                const has = assigned.has(role.id);
                const color = safeRoleColor(role.color);
                return (
                  <label key={role.id} className="checkbox-label context-menu-subitem">
                    <input
                      type="checkbox"
                      checked={has}
                      disabled={busyRole === role.id}
                      onChange={() => toggleRole(role)}
                    />
                    {color && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />}
                    {role.name}
                  </label>
                );
              })
            )}
          </>
        )}

        {isAdmin && !isSelf && (
          <>
            <div className="context-menu-separator" />
            <button className="context-menu-item" onClick={handleMute}>Mute</button>
            <button className="context-menu-item danger" onClick={handleKick}>Kick</button>
            <button className="context-menu-item danger" onClick={handleBan}>Ban</button>
          </>
        )}

        {profile === "loading" && (
          <div className="context-menu-item muted">{t("user.ctx.loading_profile")}</div>
        )}
        {profile !== "loading" && profile !== null && profile.public_hubs.length > 0 && (
          <>
            <div className="their-hubs-header">Their hubs</div>
            {profile.public_hubs.map((hub) => (
              <button
                key={hub.hub_url}
                className="their-hub-item"
                onClick={() => {
                  onClose();
                  actions.joinHub?.(hub.hub_url, "");
                }}
              >
                {hub.hub_name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
