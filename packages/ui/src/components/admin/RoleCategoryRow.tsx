import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RoleCategory } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";
import { EmojiPicker } from "../content/EmojiPicker";
import { TrashIcon } from "../Icons";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

interface Props {
  category: RoleCategory;
  onUpdate: (updates: { name?: string; color?: string | null; icon?: string | null }) => void;
  onDelete: () => void;
}

export function RoleCategoryRow({ category, onUpdate, onDelete }: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const color = safeRoleColor(category.color);
  return (
    <li
      ref={setNodeRef}
      className="roles-cat-row"
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
        <EmojiPicker onPick={(icon) => onUpdate({ icon })} unicodeOnly />
        {category.icon && <span aria-hidden="true">{category.icon}</span>}
        <input
          type="text"
          defaultValue={category.name}
          aria-label={t("hub.admin.roles.cat.rename", { name: category.name })}
          style={{ flex: 1, minWidth: 0 }}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== category.name) onUpdate({ name });
            else e.target.value = category.name;
          }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
        <button
          type="button"
          className="color-swatch"
          style={{ background: color ?? "transparent", border: color ? undefined : "1px solid var(--border)" }}
          onClick={() => setColorOpen((v) => !v)}
          aria-label={t("hub.admin.role_categories.color_label")}
          title={t("hub.admin.role_categories.color_label")}
        />
        <button
          type="button"
          className="btn-small btn-secondary danger"
          onClick={() => setConfirming(true)}
          aria-label={t("hub.admin.roles.cat.delete_aria", { name: category.name })}
          title={t("hub.admin.roles.cat.delete_aria", { name: category.name })}
        >
          <TrashIcon size={12} />
        </button>
      </div>
      {colorOpen && (
        <ColorSwatchPicker
          value={category.color}
          noColorLabel={t("hub.admin.role_categories.no_color")}
          onChange={(c) => onUpdate({ color: c })}
        />
      )}
      {confirming && (
        <div className="roles-cat-confirm" role="alert">
          <span>{t("hub.admin.roles.cat.delete_confirm", { name: category.name })}</span>
          <button type="button" className="btn-small btn-danger" onClick={onDelete}>
            {t("hub.admin.roles.cat.confirm_yes")}
          </button>
          <button type="button" className="btn-small btn-secondary" onClick={() => setConfirming(false)}>
            {t("hub.admin.roles.cat.confirm_no")}
          </button>
        </div>
      )}
    </li>
  );
}
