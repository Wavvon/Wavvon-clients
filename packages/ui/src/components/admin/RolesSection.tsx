import { useEffect, useState } from "react";
import type { RoleCategory, RoleInfo } from "../../types";
import { groupRolesByCategory, roleTintStyle, safeRoleColor } from "../../utils/roleAppearance";
import { EmojiPicker } from "../content/EmojiPicker";
import { ErrorRetry } from "../ErrorRetry";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { RoleCategoryManager, type RoleCategoryManagerActions } from "./RoleCategoryManager";

export const ALL_PERMISSIONS: { id: string; label: string }[] = [
  { id: "admin", label: "Administrator (grants everything)" },
  { id: "manage_channels", label: "Manage channels" },
  { id: "manage_roles", label: "Manage roles" },
  { id: "manage_messages", label: "Manage messages" },
  { id: "kick_members", label: "Kick members" },
  { id: "ban_members", label: "Ban members" },
  { id: "mute_members", label: "Mute members" },
  { id: "timeout_members", label: "Timeout members" },
  { id: "manage_hub_icons", label: "Manage hub icon library (upload / rename / delete)" },
  { id: "manage_channel_icons", label: "Set icons and colors on channels" },
  { id: "manage_bots", label: "Manage bots (create / delete / rotate token)" },
  { id: "read_messages", label: "Read messages" },
  { id: "send_messages", label: "Send messages" },
  { id: "manage_soundboard", label: "Manage soundboard (upload / delete clips)" },
  { id: "move_members", label: "Move members between voice channels" },
];

export interface RoleUpdateInput {
  name?: string;
  permissions?: string[];
  priority?: number;
  display_separately?: boolean;
  color?: string | null;
  icon?: string | null;
  category_id?: string | null;
}

export interface RolesSectionActions extends Partial<RoleCategoryManagerActions> {
  listRoles: () => Promise<RoleInfo[]>;
  createRole: (input: {
    name: string;
    permissions: string[];
    priority: number;
    display_separately: boolean;
  }) => Promise<RoleInfo>;
  updateRole: (roleId: string, updates: RoleUpdateInput) => Promise<RoleInfo>;
  deleteRole: (roleId: string) => Promise<void>;
  /** Category listing/CRUD and per-role color/icon/category are a known
   *  desktop Tauri-command gap (docs/docs/client-parity.md) — omitted
   *  entirely there until those commands exist. */
  listRoleCategories?: () => Promise<RoleCategory[]>;
}

interface Props {
  actions: RolesSectionActions;
}

const isBuiltin = (role: RoleInfo) => role.id.startsWith("builtin-");

export function RolesSection({ actions }: Props) {
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [permsOpenFor, setPermsOpenFor] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPriority, setNewPriority] = useState(1);
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [newHoist, setNewHoist] = useState(false);
  const [creating, setCreating] = useState(false);

  const supportsAppearance = !!(actions.listRoleCategories && actions.createRoleCategory && actions.updateRoleCategory && actions.deleteRoleCategory);

  async function load() {
    setError(null);
    try {
      const [r, c] = await Promise.all([
        actions.listRoles(),
        actions.listRoleCategories ? actions.listRoleCategories() : Promise.resolve([]),
      ]);
      setRoles(r);
      setCategories(c);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { void load(); }, []);

  function replaceRole(updated: RoleInfo) {
    setRoles((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
  }

  async function applyUpdate(roleId: string, updates: RoleUpdateInput) {
    setError(null);
    try {
      const updated = await actions.updateRole(roleId, updates);
      replaceRole(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  function toggleRolePerm(role: RoleInfo, perm: string) {
    const has = role.permissions.includes(perm);
    const next = has ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    void applyUpdate(role.id, { permissions: next });
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const created = await actions.createRole({
        name,
        permissions: Array.from(newPerms),
        priority: newPriority,
        display_separately: newHoist,
      });
      setRoles((prev) => (prev ? [...prev, created] : [created]));
      setNewName("");
      setNewPriority(1);
      setNewPerms(new Set());
      setNewHoist(false);
      setShowCreate(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(role: RoleInfo) {
    if (!window.confirm(`Delete role "${role.name}"? Members keep their other roles.`)) return;
    setError(null);
    try {
      await actions.deleteRole(role.id);
      setRoles((prev) => (prev ? prev.filter((r) => r.id !== role.id) : prev));
    } catch (e) {
      setError(String(e));
    }
  }

  if (roles === null) {
    if (error) {
      return (
        <section>
          <h1>Roles</h1>
          <ErrorRetry message={error} onRetry={load} />
        </section>
      );
    }
    return <p className="muted">Loading…</p>;
  }

  const groups = groupRolesByCategory(roles, categories, { includeEmptyCategories: true });

  return (
    <section>
      <h1>Roles</h1>
      <p className="muted">Roles grant permissions. Higher priority ranks above lower priority for moderation and role-assignment guards.</p>
      {error && <p className="error-text">{error}</p>}

      {!showCreate ? (
        <button type="button" onClick={() => setShowCreate(true)}>New role</button>
      ) : (
        <div className="settings-section" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "var(--space-3)" }}>
          <div className="settings-row" style={{ gap: "var(--space-2)" }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Role name"
              aria-label="Role name"
              autoFocus
            />
            <input
              type="number"
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
              style={{ maxWidth: 90 }}
              title="Priority (higher = ranked above)"
              aria-label="Priority"
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-2) 0" }}>
            {ALL_PERMISSIONS.map((p) => (
              <label key={p.id} className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
                <input
                  type="checkbox"
                  checked={newPerms.has(p.id)}
                  onChange={() => setNewPerms((prev) => {
                    const n = new Set(prev);
                    if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                    return n;
                  })}
                />
                {p.label}
              </label>
            ))}
          </div>
          <label className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={newHoist} onChange={(e) => setNewHoist(e.target.checked)} />
            Show members of this role separately in the list
          </label>
          <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
            <button type="button" onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Creating…" : "Create role"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {supportsAppearance && (
        <RoleCategoryManager
          categories={categories}
          onChange={setCategories}
          actions={{
            createRoleCategory: actions.createRoleCategory!,
            updateRoleCategory: actions.updateRoleCategory!,
            deleteRoleCategory: actions.deleteRoleCategory!,
          }}
        />
      )}

      {groups.map((group) => (
        <div key={group.category?.id ?? "uncategorized"} className="role-category-group">
          <div
            className={`role-category-header ${group.category?.color ? "role-category-header-tinted" : ""}`}
            style={roleTintStyle(group.category?.color)}
          >
            {group.category?.icon && <span>{group.category.icon}</span>}
            <span>{group.category?.name ?? "Uncategorized"}</span>
          </div>

          {group.roles.length === 0 && (
            <p className="muted" style={{ marginLeft: "var(--space-2)" }}>No roles in this category.</p>
          )}

          {group.roles.map((role) => (
            <div key={role.id}>
              <div className="settings-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ minWidth: 20, textAlign: "center" }}>{role.icon ?? "—"}</span>
                <span style={{ minWidth: 140 }}>{role.name}</span>
                <span className="muted" style={{ fontSize: "var(--text-xs)", flex: 1 }}>
                  {role.permissions.join(", ") || "—"}
                </span>

                {/* Appearance (color/icon/category) is rejected server-side for
                    built-in roles, and the whole block requires the desktop
                    Tauri-command gap above to be closed first. */}
                {!isBuiltin(role) && supportsAppearance && (
                  <>
                    <select
                      value={role.category_id ?? ""}
                      onChange={(e) => applyUpdate(role.id, { category_id: e.target.value || null })}
                      title="Category"
                    >
                      <option value="">No category</option>
                      {categories
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>

                    <EmojiPicker onPick={(icon) => applyUpdate(role.id, { icon })} unicodeOnly />
                    {role.icon && (
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        onClick={() => applyUpdate(role.id, { icon: null })}
                      >
                        Clear
                      </button>
                    )}

                    <button
                      type="button"
                      className="color-swatch"
                      style={{
                        background: safeRoleColor(role.color) ?? "transparent",
                        border: safeRoleColor(role.color) ? undefined : "1px solid var(--border)",
                      }}
                      onClick={() => setColorPickerFor(colorPickerFor === role.id ? null : role.id)}
                      title="Role color"
                    />
                  </>
                )}

                {role.id !== "builtin-owner" && (
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    aria-expanded={permsOpenFor === role.id}
                    onClick={() => setPermsOpenFor(permsOpenFor === role.id ? null : role.id)}
                  >
                    Permissions {permsOpenFor === role.id ? "▴" : "▾"}
                  </button>
                )}
                {!isBuiltin(role) && (
                  <button
                    type="button"
                    className="btn-small btn-secondary danger"
                    onClick={() => handleDelete(role)}
                  >
                    Delete
                  </button>
                )}
              </div>

              {colorPickerFor === role.id && (
                <ColorSwatchPicker
                  value={role.color}
                  noColorLabel="No color"
                  onChange={(color) => applyUpdate(role.id, { color })}
                />
              )}

              {permsOpenFor === role.id && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", padding: "var(--space-2) 0 var(--space-3) var(--space-4)" }}>
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p.id} className="checkbox-label" style={{ fontSize: "var(--text-sm)" }}>
                      <input
                        type="checkbox"
                        checked={role.permissions.includes(p.id)}
                        onChange={() => toggleRolePerm(role, p.id)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
