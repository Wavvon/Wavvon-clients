import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleCategory, RoleInfo } from "../types";
import { listRoles, listRoleCategories, updateRole } from "@platform";
import { HubApiError } from "../platform/http";
import { groupRolesByCategory, roleTintStyle } from "../utils/roleAppearance";
import { RoleCategoryManager } from "./RoleCategoryManager";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { EmojiPicker } from "./EmojiPicker";

export function RolesSection() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRoles(), listRoleCategories()])
      .then(([r, c]) => {
        if (cancelled) return;
        setRoles(r);
        setCategories(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof HubApiError ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (roles === null) {
    return <p className="muted">{t("modal.loading")}</p>;
  }

  const groups = groupRolesByCategory(roles, categories, { includeEmptyCategories: true });

  return (
    <section>
      <h1>{t("hub.admin.roles.title")}</h1>
      <p className="muted">{t("hub.admin.roles.hint")}</p>
      {error && <p className="error-text">{error}</p>}

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
            <div key={role.id} className="settings-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ minWidth: 20, textAlign: "center" }}>{role.icon ?? "—"}</span>
              <span style={{ minWidth: 140 }}>{role.name}</span>
              <span className="muted" style={{ fontSize: "var(--text-xs)", flex: 1 }}>
                {role.permissions.join(", ") || "—"}
              </span>

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

              <EmojiPicker onPick={(icon) => applyUpdate(role.id, { icon })} />
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
                style={{ background: role.color ?? "transparent", border: role.color ? undefined : "1px solid var(--border)" }}
                onClick={() => setColorPickerFor(colorPickerFor === role.id ? null : role.id)}
                title={t("hub.admin.roles.color_label")}
              />

              {colorPickerFor === role.id && (
                <ColorSwatchPicker
                  value={role.color}
                  noColorLabel={t("hub.admin.role_categories.no_color")}
                  onChange={(color) => applyUpdate(role.id, { color })}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
