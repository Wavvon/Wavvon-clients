import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleCategory, RoleInfo } from "@shared/types";
import { listRoles, listRoleCategories, updateRole, createRole, deleteRole } from "@platform";
import { HubApiError } from "../../platform/http";
import { ALL_PERMISSIONS } from "@shared/constants";
import { groupRolesByCategory, roleTintStyle, safeRoleColor } from "@shared/utils/roleAppearance";
import { RoleCategoryManager } from "./RoleCategoryManager";
import { ColorSwatchPicker } from "@components/common/ColorSwatchPicker";
import { EmojiPicker, ErrorRetry } from "@wavvon/ui";

// New role-admin controls (create / delete / permission editing) use plain
// English to match the desktop RoleCreator/RoleEditor this is ported from
// and to avoid a 4-locale coverage gap; the pre-existing strings keep t().

const isBuiltin = (role: RoleInfo) => role.id.startsWith("builtin-");

export function RolesSection() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [permsOpenFor, setPermsOpenFor] = useState<string | null>(null);

  // New-role creator.
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPriority, setNewPriority] = useState(1);
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [newHoist, setNewHoist] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      const [r, c] = await Promise.all([listRoles(), listRoleCategories()]);
      setRoles(r);
      setCategories(c);
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  useEffect(() => { void load(); }, []);

  function replaceRole(updated: RoleInfo) {
    setRoles((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
  }

  async function applyUpdate(roleId: string, updates: Parameters<typeof updateRole>[1]) {
    setError(null);
    try {
      const updated = await updateRole(roleId, updates);
      replaceRole(updated);
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
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
      const created = await createRole({
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
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(role: RoleInfo) {
    if (!window.confirm(`Delete role "${role.name}"? Members keep their other roles.`)) return;
    setError(null);
    try {
      await deleteRole(role.id);
      setRoles((prev) => (prev ? prev.filter((r) => r.id !== role.id) : prev));
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  if (roles === null) {
    if (error) {
      return (
        <section>
          <h1>{t("hub.admin.roles.title")}</h1>
          <ErrorRetry message={error} onRetry={load} />
        </section>
      );
    }
    return <p className="muted">{t("modal.loading")}</p>;
  }

  const groups = groupRolesByCategory(roles, categories, { includeEmptyCategories: true });

  return (
    <section>
      <h1>{t("hub.admin.roles.title")}</h1>
      <p className="muted">{t("hub.admin.roles.hint")}</p>
      {error && <p className="error-text">{error}</p>}

      {/* Create role */}
      {!showCreate ? (
        <button type="button" onClick={() => setShowCreate(true)}>{t("hub.admin.roles.new")}</button>
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
              {creating ? t("modal.creating") : t("hub.admin.roles.create")}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}

      <RoleCategoryManager categories={categories} onChange={setCategories} />

      {groups.map((group) => (
        <div key={group.category?.id ?? "uncategorized"} className="role-category-group">
          <div
            className={`role-category-header ${group.category?.color ? "role-category-header-tinted" : ""}`}
            style={roleTintStyle(group.category?.color)}
          >
            {group.category?.icon && <span>{group.category.icon}</span>}
            <span>{group.category?.name ?? t("hub.admin.roles.uncategorized")}</span>
          </div>

          {group.roles.length === 0 && (
            <p className="muted" style={{ marginLeft: "var(--space-2)" }}>
              {t("hub.admin.role_categories.category_empty")}
            </p>
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
                    built-in roles (require_not_builtin), so only show these for
                    custom roles. Permissions use a separate endpoint and are
                    still editable for @everyone below. */}
                {!isBuiltin(role) && (
                  <>
                    <select
                      value={role.category_id ?? ""}
                      onChange={(e) => applyUpdate(role.id, { category_id: e.target.value || null })}
                      title={t("hub.admin.roles.category_label")}
                    >
                      <option value="">{t("hub.admin.roles.category_none")}</option>
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
                        {t("modal.clear")}
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
                      title={t("hub.admin.roles.color_label")}
                    />
                  </>
                )}

                {/* Owner's permissions are implicit and can't be edited; @everyone + custom roles can. */}
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
                  noColorLabel={t("hub.admin.role_categories.no_color")}
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
