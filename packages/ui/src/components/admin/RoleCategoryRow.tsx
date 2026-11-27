import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RoleCategory } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";
import { EmojiPicker } from "../content/EmojiPicker";
import { EditIcon, TrashIcon } from "../Icons";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

interface Props {
  category: RoleCategory;
  roleCount: number;
  onUpdate: (updates: { name?: string; color?: string | null; icon?: string | null }) => void;
  onDelete: () => void;
}

/** One category: its name and how many roles it holds. Renaming opens it in
 *  place, with its icon and colour; deleting asks in place too. */
export function RoleCategoryRow({ category, roleCount, onUpdate, onDelete }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [name, setName] = useState(category.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const color = safeRoleColor(category.color);

  function commit() {
    const next = name.trim();
    if (next && next !== category.name) onUpdate({ name: next });
    else setName(category.name);
    setMode("view");
  }

  return (
    <li
      ref={setNodeRef}
      className={`roles-cat-row${mode !== "view" ? " open" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      <div className="roles-cat-line">
        <span
          {...attributes}
          {...listeners}
          className="roles-row-handle"
          aria-label={t("hub.admin.roles.drag_role", { name: category.name })}
          title={t("hub.admin.roles.drag_role", { name: category.name })}
        >
          ⠿
        </span>
        {mode === "edit" ? (
          <>
            <input
              type="text"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setName(category.name); setMode("view"); }
              }}
              aria-label={t("hub.admin.roles.cat.rename", { name: category.name })}
              className="roles-cat-name-input"
            />
            <button type="button" className="btn-primary btn-small" onClick={commit}>
              {t("hub.admin.roles.cat.ok")}
            </button>
          </>
        ) : (
          <>
            {color && <span className="roles-dot" aria-hidden="true" style={{ background: color }} />}
            {category.icon && <span aria-hidden="true">{category.icon}</span>}
            <span className="roles-cat-name">{category.name}</span>
            <span className="roles-cat-count">{t("hub.admin.roles.cat.count", { count: roleCount })}</span>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setMode("edit")}
              aria-label={t("hub.admin.roles.cat.rename", { name: category.name })}
              title={t("hub.admin.roles.cat.rename", { name: category.name })}
            >
              <EditIcon size={14} />
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setMode("confirm")}
              aria-label={t("hub.admin.roles.cat.delete_aria", { name: category.name })}
              title={t("hub.admin.roles.cat.delete_aria", { name: category.name })}
            >
              <TrashIcon size={14} />
            </button>
          </>
        )}
      </div>
      {mode === "edit" && (
        <div className="roles-cat-extra">
          <div className="settings-row">
            <span className="muted">{t("hub.admin.roles.icon_label")}</span>
            <EmojiPicker onPick={(icon) => onUpdate({ icon })} unicodeOnly />
            {category.icon && <span aria-hidden="true">{category.icon}</span>}
            {category.icon && (
              <button type="button" className="btn-small" onClick={() => onUpdate({ icon: null })}>
                {t("hub.admin.roles.clear_icon")}
              </button>
            )}
          </div>
          <ColorSwatchPicker
            value={category.color}
            noColorLabel={t("hub.admin.role_categories.no_color")}
            onChange={(c) => onUpdate({ color: c })}
          />
        </div>
      )}
      {mode === "confirm" && (
        <div className="roles-cat-extra" role="alert">
          <span>{t("hub.admin.roles.cat.delete_confirm_n", { name: category.name, count: roleCount })}</span>
          <div className="settings-row">
            <button type="button" className="btn-small btn-secondary danger" onClick={onDelete}>
              {t("hub.admin.roles.cat.confirm_yes")}
            </button>
            <button type="button" className="btn-small btn-ghost" onClick={() => setMode("view")}>
              {t("hub.admin.roles.cat.confirm_no")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
