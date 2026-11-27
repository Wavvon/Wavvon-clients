import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

const FILTER_THRESHOLD = 6;

// The member's roles as chips, each removable where the viewer outranks it,
// and "+ role" opening a filterable list of the roles they may give.
export function MemberRoleManager({ pubkey, currentRoles, myMaxPriority, onChanged, actions }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [allRoles, setAllRoles] = useState<RoleInfo[] | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(currentRoles.map((r) => r.id)));
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
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
      // From the roles the member is shown with, so a chip removed before the
      // list of all roles ever loaded does not take the others with it.
      onChanged(has ? currentRoles.filter((r) => r.id !== role.id) : [...currentRoles, role]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyRole(null);
    }
  }

  const assignable = (allRoles ?? [])
    .filter((r) => r.id !== "builtin-everyone" && r.priority < myMaxPriority)
    .sort((a, b) => b.priority - a.priority);
  const needle = filter.trim().toLowerCase();
  const shown = needle ? assignable.filter((r) => r.name.toLowerCase().includes(needle)) : assignable;

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {currentRoles
        .filter((r) => r.id !== "builtin-everyone")
        .map((r) => {
          const color = safeRoleColor(r.color);
          const removable = r.id !== "builtin-owner" && r.priority < myMaxPriority;
          return (
            <span key={r.id} className="member-role-chip">
              <span className="roles-dot" aria-hidden="true" style={{ background: color ?? "var(--border-strong)" }} />
              {r.name}
              {removable && (
                <button
                  type="button"
                  className="member-role-chip-x"
                  disabled={busyRole === r.id}
                  onClick={() => void toggle(r)}
                  aria-label={t("hub.admin.members.remove_role", { name: r.name })}
                  title={t("hub.admin.members.remove_role", { name: r.name })}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      <button type="button" className="member-role-add" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {t("hub.admin.members.add_role")}
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
            <div style={{ padding: "4px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{t("user.ctx.roles_loading")}</div>
          ) : assignable.length === 0 ? (
            <div style={{ padding: "4px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{t("user.ctx.roles_empty")}</div>
          ) : (
            <>
              {assignable.length > FILTER_THRESHOLD && (
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t("hub.admin.roles.search")}
                  aria-label={t("hub.admin.roles.search")}
                  style={{ margin: "0 8px 4px", width: "calc(100% - 16px)" }}
                />
              )}
              {shown.length === 0 && (
                <div style={{ padding: "4px 14px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{t("hub.admin.roles.no_match")}</div>
              )}
            {shown.map((role) => {
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
            })}
            </>
          )}
        </div>
      )}
    </span>
  );
}
