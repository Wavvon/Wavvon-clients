import { useState } from "react";
import { useTranslation } from "react-i18next";
import { permissionSections, type PermissionCatalogueEntry } from "../../utils/channelPermissions";
import { SECTION_LABELS } from "./PermissionSections";

interface Props {
  ids: string[];
  catalogue: PermissionCatalogueEntry[];
  granted: string[];
  onToggle: (perm: string) => void;
}

export function RolePermissionsTab({ ids, catalogue, granted, onToggle }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const label = (id: string) => t(`hub.admin.roles.perm.${id}`, { defaultValue: id });
  const desc = (id: string) =>
    t(`hub.admin.roles.perm_desc.${id}`, { defaultValue: t("hub.admin.roles.perm_fallback") });
  const needle = query.trim().toLowerCase();
  const matches = (id: string) =>
    !needle || label(id).toLowerCase().includes(needle) || desc(id).toLowerCase().includes(needle);
  const sections = permissionSections(ids, catalogue)
    .map((s) => ({ ...s, shown: s.ids.filter(matches) }))
    .filter((s) => s.shown.length > 0);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("hub.admin.roles.perm_search")}
        aria-label={t("hub.admin.roles.perm_search")}
      />
      {sections.length === 0 && <p className="muted">{t("hub.admin.roles.perm_no_match")}</p>}
      {sections.map((s) => (
        <section key={s.key} className="roles-perm-group">
          <h3 className="roles-perm-heading">
            {SECTION_LABELS[s.key] ? t(SECTION_LABELS[s.key]) : s.key}{" "}
            <span className="muted">
              {s.ids.filter((id) => granted.includes(id)).length}/{s.ids.length}
            </span>
          </h3>
          {s.shown.map((id) => (
            <label key={id} className="roles-perm-row">
              <span className="roles-perm-text">
                <span>{label(id)}</span>
                <span className="muted roles-perm-desc">{desc(id)}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="roles-switch"
                checked={granted.includes(id)}
                onChange={() => onToggle(id)}
              />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
