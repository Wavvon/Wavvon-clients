import { useEffect, useRef, useState } from "react";
import type { RoleInfo } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";

export interface MemberRoleManagerActions {
  listRoles: () => Promise<RoleInfo[]>;
  listUserRoles: (pubkey: string) => Promise<RoleInfo[]>;
  assignRoleToUser: (pubkey: string, roleId: string) => Promise<void>;
  removeRoleFromUser: (pubkey: string, roleId: string) => Promise<void>;
}

interface Props {
  pubkey: string;
  currentRoles: RoleInfo[];
  /** Highest priority among the viewer's own roles — only roles strictly
   *  below it are assignable here, matching the hub's own guard. */
  myMaxPriority: number;
  onChanged: (roles: RoleInfo[]) => void;
  actions: MemberRoleManagerActions;
}

// Chip list + a "manage roles" popover, for inline role editing in the
// hub-admin Members table.
export function MemberRoleManager({ pubkey, currentRoles, myMaxPriority, onChanged, actions }: Props) {
  const [open, setOpen] = useState(false);
  const [allRoles, setAllRoles] = useState<RoleInfo[] | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(currentRoles.map((r) => r.id)));
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAssigned(new Set(currentRoles.map((r) => r.id)));
  }, [currentRoles]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    Promise.all([actions.listRoles(), actions.listUserRoles(pubkey)])
      .then(([all, mine]) => {
        if (cancelled) return;
        setAllRoles(all);
        setAssigned(new Set(mine.map((r) => r.id)));
      })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pubkey]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function toggle(role: RoleInfo) {
    if (busyRole) return;
    const has = assigned.has(role.id);
    setBusyRole(role.id);
    setError(null);
    try {
      if (has) await actions.removeRoleFromUser(pubkey, role.id);
      else await actions.assignRoleToUser(pubkey, role.id);
      const nextIds = new Set(assigned);
      if (has) nextIds.delete(role.id); else nextIds.add(role.id);
      setAssigned(nextIds);
      onChanged((allRoles ?? []).filter((r) => nextIds.has(r.id)));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyRole(null);
    }
  }

  const assignable = (allRoles ?? [])
    .filter((r) => r.id !== "builtin-everyone" && r.priority < myMaxPriority)
    .sort((a, b) => b.priority - a.priority);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {currentRoles.length === 0 ? (
        <span className="muted">—</span>
      ) : (
        currentRoles.map((r) => {
          const color = safeRoleColor(r.color);
          return (
            <span key={r.id} className="role-chip" style={color ? { borderColor: color, color } : undefined}>
              {r.name}
            </span>
          );
        })
      )}
      <button type="button" className="btn-small btn-secondary" onClick={() => setOpen((v) => !v)}>
        Manage roles
      </button>
      {open && (
        <div
          ref={popRef}
          className="context-menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 20,
            minWidth: 200,
            maxHeight: 260,
            overflowY: "auto",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "4px 0",
            boxShadow: "var(--shadow-lg, 0 4px 16px rgba(0,0,0,.4))",
          }}
        >
          {error && <p className="error-text" style={{ padding: "4px 14px", margin: 0 }}>{error}</p>}
          {allRoles === null ? (
            <div style={{ padding: "4px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Loading roles…</div>
          ) : assignable.length === 0 ? (
            <div style={{ padding: "4px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>No assignable roles</div>
          ) : (
            assignable.map((role) => {
              const has = assigned.has(role.id);
              const color = safeRoleColor(role.color);
              return (
                <label
                  key={role.id}
                  className="context-menu-item"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", cursor: "pointer" }}
                >
                  <input type="checkbox" checked={has} disabled={busyRole === role.id} onChange={() => toggle(role)} />
                  {color && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                  <span>{role.name}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </span>
  );
}
