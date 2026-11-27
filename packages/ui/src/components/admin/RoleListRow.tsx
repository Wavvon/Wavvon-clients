import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RoleInfo } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";
import { LockIcon } from "../Icons";

interface Props {
  role: RoleInfo;
  selected: boolean;
  onSelect: () => void;
  /** `sortable` rows carry a drag handle, a pinned one a lock in its place. */
  mode: "sortable" | "plain" | "pinned";
}

export function RoleListRow({ role, selected, onSelect, mode }: Props) {
  const { t } = useTranslation();
  const sortable = useSortable({ id: role.id, disabled: mode !== "sortable" });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const color = safeRoleColor(role.color);
  return (
    <li
      ref={setNodeRef}
      className={`roles-row${selected ? " selected" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      {mode === "sortable" ? (
        <span
          {...attributes}
          {...listeners}
          className="roles-row-handle"
          aria-label={t("hub.admin.roles.drag_role", { name: role.name })}
          title={t("hub.admin.roles.drag_role", { name: role.name })}
        >
          ⠿
        </span>
      ) : mode === "pinned" ? (
        <span className="roles-row-handle fixed" role="img" aria-label={t("hub.admin.roles.pinned")} title={t("hub.admin.roles.pinned")}>
          <LockIcon size={12} />
        </span>
      ) : (
        <span className="roles-row-handle fixed" aria-hidden="true" />
      )}
      <button type="button" className="roles-row-main" aria-current={selected || undefined} onClick={onSelect}>
        <span className="roles-dot" aria-hidden="true" style={{ background: color ?? "var(--border)" }} />
        {role.icon && <span className="roles-row-icon" aria-hidden="true">{role.icon}</span>}
        <span className="roles-row-name">{role.name}</span>
      </button>
    </li>
  );
}
