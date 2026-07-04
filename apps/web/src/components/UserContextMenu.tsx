import React, { useEffect, useRef, useState } from "react";
import { hubFetch, listRoles, listUserRoles, assignRoleToUser, removeRoleFromUser } from "@platform";
import type { RoleInfo } from "../types";
import { safeRoleColor } from "../utils/roleAppearance";

interface Props {
  pubkey: string;
  displayName: string | null;
  isAdmin: boolean;
  /** Whether the viewer can manage roles (admin or manage_roles). Gates the roles section. */
  canManageRoles?: boolean;
  /** Highest priority among the viewer's own roles; only lower-priority roles are assignable (matches the hub guard). */
  myMaxPriority?: number;
  position: { x: number; y: number };
  onClose: () => void;
  onDm?: () => void;
  onToast?: (msg: string) => void;
  /** Called after a role is assigned/removed so the caller can refresh the member list. */
  onRolesChanged?: () => void;
}

const itemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 14px",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
};

export function UserContextMenu({
  pubkey, displayName, isAdmin, canManageRoles, myMaxPriority, position,
  onClose, onDm, onToast, onRolesChanged,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [busyRole, setBusyRole] = useState<string | null>(null);

  const style: React.CSSProperties = {
    position: "fixed",
    top: position.y,
    left: position.x,
    zIndex: 9999,
  };

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
    Promise.all([listRoles(), listUserRoles(pubkey)])
      .then(([all, mine]) => {
        if (cancelled) return;
        setRoles(all);
        setAssigned(new Set(mine.map((r) => r.id)));
      })
      .catch((e) => { if (!cancelled) onToast?.(`Failed to load roles: ${e}`); });
    return () => { cancelled = true; };
  }, [canManageRoles, pubkey, onToast]);

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
      onToast?.("Public key copied");
    } catch {
      onToast?.("Copy failed");
    }
    onClose();
  }

  async function handleKick() {
    if (!confirm(`Kick ${displayName ?? pubkey.slice(0, 8)}?`)) return;
    try {
      await hubFetch("/moderation/kick", {
        method: "POST",
        body: JSON.stringify({ target_public_key: pubkey }),
      });
      onToast?.("Kicked");
    } catch (e) {
      onToast?.(`Failed to kick: ${e}`);
    }
    onClose();
  }

  async function handleBan() {
    if (!confirm(`Ban ${displayName ?? pubkey.slice(0, 8)}? They won't be able to rejoin.`)) return;
    try {
      await hubFetch("/moderation/bans", {
        method: "POST",
        body: JSON.stringify({ target_public_key: pubkey }),
      });
      onToast?.("Banned");
    } catch (e) {
      onToast?.(`Failed to ban: ${e}`);
    }
    onClose();
  }

  async function handleMute() {
    try {
      await hubFetch("/moderation/mutes", {
        method: "POST",
        body: JSON.stringify({ target_public_key: pubkey }),
      });
      onToast?.("Muted");
    } catch (e) {
      onToast?.(`Failed to mute: ${e}`);
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
        await removeRoleFromUser(pubkey, role.id);
        setAssigned((prev) => { const n = new Set(prev); n.delete(role.id); return n; });
      } else {
        await assignRoleToUser(pubkey, role.id);
        setAssigned((prev) => new Set(prev).add(role.id));
      }
      onRolesChanged?.();
    } catch (e) {
      onToast?.(`Failed to update role: ${e}`);
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
        style={{
          ...style,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-lg, 0 4px 16px rgba(0,0,0,.4))",
          minWidth: 180,
          maxHeight: "80vh",
          overflowY: "auto",
          padding: "4px 0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="context-menu-header"
          style={{
            padding: "8px 14px",
            fontWeight: 600,
            fontSize: "var(--text-sm)",
            borderBottom: "1px solid var(--border)",
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName ?? pubkey.slice(0, 8) + "…"}
        </div>

        {onDm && (
          <button className="context-menu-item" onClick={() => { onDm(); onClose(); }} style={itemStyle}>
            Send DM
          </button>
        )}

        <button className="context-menu-item" onClick={handleCopyKey} style={itemStyle}>
          Copy public key
        </button>

        {canManageRoles && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <div style={{ padding: "4px 14px", fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Roles
            </div>
            {roles === null ? (
              <div style={{ padding: "4px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Loading roles…</div>
            ) : assignableRoles.length === 0 ? (
              <div style={{ padding: "4px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>No assignable roles</div>
            ) : (
              assignableRoles.map((role) => {
                const has = assigned.has(role.id);
                const color = safeRoleColor(role.color);
                return (
                  <button
                    key={role.id}
                    className="context-menu-item"
                    role="menuitemcheckbox"
                    aria-checked={has}
                    disabled={busyRole === role.id}
                    onClick={() => toggleRole(role)}
                    style={{ ...itemStyle, display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span aria-hidden="true" style={{ width: 14, display: "inline-block" }}>{has ? "✓" : ""}</span>
                    {color && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{role.name}</span>
                  </button>
                );
              })
            )}
          </>
        )}

        {isAdmin && (
          <>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <button className="context-menu-item" onClick={handleMute} style={itemStyle}>
              Mute
            </button>
            <button className="context-menu-item" onClick={handleKick} style={{ ...itemStyle, color: "var(--danger)" }}>
              Kick
            </button>
            <button className="context-menu-item" onClick={handleBan} style={{ ...itemStyle, color: "var(--danger)" }}>
              Ban
            </button>
          </>
        )}
      </div>
    </div>
  );
}
