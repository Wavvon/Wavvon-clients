import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { RoleCategory, RoleInfo } from "../../types";
import { groupRolesByCategory, roleTintStyle } from "../../utils/roleAppearance";
import { movableRoles, reorderWithinGroup } from "./RoleOrderEditor";
import { RoleListRow } from "./RoleListRow";

interface Props {
  roles: RoleInfo[];
  categories: RoleCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  creating: boolean;
  onManageCategories?: () => void;
  /** Present only when the hub can reorder and the caller's rank is known. */
  reorder?: { myMaxPriority: number; everyoneMovable: boolean; onReorder: (idsHighestFirst: string[]) => void };
}

export function RoleListPane({
  roles,
  categories,
  selectedId,
  onSelect,
  onNew,
  creating,
  onManageCategories,
  reorder,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The owner role is left out: one per hub, nothing to edit. `everyone` sits
  // in the order like any role where the hub lets it move, else at the bottom.
  const everyoneMovable = !!reorder?.everyoneMovable;
  const everyone = everyoneMovable ? undefined : roles.find((r) => r.id === "builtin-everyone");
  const middle = roles.filter((r) => r.id !== "builtin-owner" && (everyoneMovable || r.id !== "builtin-everyone"));
  const movableIds = new Set(reorder ? movableRoles(roles, reorder.myMaxPriority, everyoneMovable).map((r) => r.id) : []);
  const needle = query.trim().toLowerCase();
  const matches = (r: RoleInfo) => !needle || r.name.toLowerCase().includes(needle);
  const groups = groupRolesByCategory(
    middle.slice().sort((a, b) => b.priority - a.priority).filter(matches),
    categories,
  );
  const pinned = everyone && matches(everyone) ? [everyone] : [];
  const shownAny = groups.length > 0 || pinned.length > 0;

  const row = (r: RoleInfo, mode: "sortable" | "plain" | "pinned") => (
    <RoleListRow
      key={r.id}
      role={r}
      selected={selectedId === r.id}
      onSelect={() => onSelect(r.id)}
      mode={mode}
    />
  );

  function onDragEnd(e: DragEndEvent) {
    if (!reorder || !e.over || e.active.id === e.over.id) return;
    const ordered = movableRoles(roles, reorder.myMaxPriority, everyoneMovable);
    const group = groups.find((g) => g.roles.some((r) => r.id === e.active.id));
    const groupIds = ordered.filter((r) => group?.roles.some((g) => g.id === r.id)).map((r) => r.id);
    const next = reorderWithinGroup(ordered.map((r) => r.id), groupIds, String(e.active.id), String(e.over.id));
    if (next) reorder.onReorder(next);
  }

  return (
    <div className="roles-list-pane">
      <div className="roles-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("hub.admin.roles.search")}
          aria-label={t("hub.admin.roles.search")}
        />
        <button type="button" className="btn-primary" onClick={onNew} disabled={creating}>
          {t("hub.admin.roles.new_short")}
        </button>
      </div>

      {!shownAny && <p className="muted">{t("hub.admin.roles.no_match")}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {groups.map((g) => {
          const ids = g.roles.filter((r) => movableIds.has(r.id)).map((r) => r.id);
          return (
            <div key={g.category?.id ?? "none"} className="role-category-group">
              <div
                className={`role-category-header ${g.category?.color ? "role-category-header-tinted" : ""}`}
                style={roleTintStyle(g.category?.color)}
              >
                {g.category?.icon && <span>{g.category.icon}</span>}
                <span>{g.category?.name ?? t("hub.admin.roles.category_none")}</span>
              </div>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className="roles-nav">
                  {g.roles.map((r) => row(r, movableIds.has(r.id) ? "sortable" : "plain"))}
                </ul>
              </SortableContext>
            </div>
          );
        })}
      </DndContext>
      {pinned.length > 0 && <ul className="roles-nav">{pinned.map((r) => row(r, "pinned"))}</ul>}

      <p className="muted roles-hint">{t("hub.admin.roles.list_hint")}</p>
      {onManageCategories && (
        <button type="button" className="btn-secondary roles-manage-cats" onClick={onManageCategories}>
          {t("hub.admin.roles.manage_categories")}
        </button>
      )}
    </div>
  );
}
