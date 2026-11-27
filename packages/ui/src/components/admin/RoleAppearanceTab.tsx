import { useTranslation } from "react-i18next";
import type { RoleCategory } from "../../types";
import { roleTintStyle, safeRoleColor } from "../../utils/roleAppearance";
import { EmojiPicker } from "../content/EmojiPicker";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import type { RoleDraft } from "./roleDraft";

interface Props {
  values: Required<Pick<RoleDraft, "name" | "color" | "icon" | "category_id" | "display_separately">>;
  categories: RoleCategory[];
  onChange: (patch: RoleDraft) => void;
}

export function RoleAppearanceTab({ values, categories, onChange }: Props) {
  const { t } = useTranslation();
  const color = safeRoleColor(values.color);
  return (
    <div className="roles-appearance">
      <label className="roles-field">
        <span className="settings-label">{t("hub.admin.roles.name_label")}</span>
        <input type="text" value={values.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>

      <div className="roles-field">
        <span className="settings-label">{t("hub.admin.roles.color_label")}</span>
        <ColorSwatchPicker
          value={values.color}
          noColorLabel={t("hub.admin.roles.no_color")}
          onChange={(c) => onChange({ color: c })}
        />
      </div>

      <div className="roles-field">
        <span className="settings-label">{t("hub.admin.roles.icon_label")}</span>
        <div className="settings-row">
          <EmojiPicker onPick={(icon) => onChange({ icon })} unicodeOnly />
          {values.icon && <span aria-hidden="true">{values.icon}</span>}
          {values.icon && (
            <button type="button" className="btn-small" onClick={() => onChange({ icon: null })}>
              {t("hub.admin.roles.clear_icon")}
            </button>
          )}
        </div>
      </div>

      {categories.length > 0 && (
        <label className="roles-field">
          <span className="settings-label">{t("hub.admin.roles.category_label")}</span>
          <select value={values.category_id ?? ""} onChange={(e) => onChange({ category_id: e.target.value || null })}>
            <option value="">{t("hub.admin.roles.category_none")}</option>
            {categories
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </label>
      )}

      <label className="roles-perm-row">
        <span className="roles-perm-text">{t("hub.admin.roles.hoist_switch")}</span>
        <input
          type="checkbox"
          role="switch"
          className="roles-switch"
          checked={values.display_separately}
          onChange={(e) => onChange({ display_separately: e.target.checked })}
        />
      </label>

      <div className="roles-field">
        <span className="settings-label">{t("hub.admin.roles.preview")}</span>
        <p className="roles-preview" style={roleTintStyle(color)}>
          <span className={color ? "name-colored" : undefined}>{t("hub.admin.roles.preview_name")}</span>
          <span className="role-chip" style={color ? { borderColor: color, color } : undefined}>
            {values.icon} {values.name}
          </span>
        </p>
      </div>
    </div>
  );
}
