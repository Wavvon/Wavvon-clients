import { useEffect, useState } from "react";
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
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RoleInfo } from "../../types";

const BUILTIN = new Set(["builtin-owner", "builtin-everyone"]);

/** The roles the caller may move, highest first: what `PUT /roles/order`
 *  takes, and nothing it would refuse. */
export function movableRoles(roles: RoleInfo[], myMaxPriority: number): RoleInfo[] {
  return roles
    .filter((r) => !BUILTIN.has(r.id) && r.priority < myMaxPriority)
    .sort((a, b) => b.priority - a.priority);
}

/** Reorder roles by dragging or with the up and down buttons, saved in one
 *  call. Roles at or above the caller's own priority, and the built-ins, are
 *  listed but cannot move: a move the hub would refuse is not offered. */
export function RoleOrderEditor({
  roles,
  myMaxPriority,
  onSave,
}: {
  roles: RoleInfo[];
  myMaxPriority: number;
  onSave: (roleIdsHighestFirst: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const initial = movableRoles(roles, myMaxPriority).map((r) => r.id);
  const [order, setOrder] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = initial.join(",");
  // A role created, deleted or reordered elsewhere resets the draft.
  useEffect(() => setOrder(initial), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(roles.map((r) => [r.id, r]));
  const fixed = roles
    .filter((r) => r.id !== "builtin-everyone" && !order.includes(r.id))
    .sort((a, b) => b.priority - a.priority);
  const everyone = byId.get("builtin-everyone");
  const changed = order.join(",") !== key;

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    setOrder(arrayMove(order, from, to));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    move(order.indexOf(String(active.id)), order.indexOf(String(over.id)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const fixedRow = (r: RoleInfo) => (
    <li key={r.id} className="muted" style={{ padding: "6px 8px", fontSize: "var(--text-sm)" }}>
      {r.name} <span style={{ fontSize: "var(--text-xs)" }}>{t("hub.admin.roles.order.fixed")}</span>
    </li>
  );

  return (
    <div className="settings-section">
      <p className="muted">{t("hub.admin.roles.order.hint")}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {fixed.map(fixedRow)}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id, i) => {
              const role = byId.get(id);
              return role ? (
                <SortableRole
                  key={id}
                  role={role}
                  first={i === 0}
                  last={i === order.length - 1}
                  onUp={() => move(i, i - 1)}
                  onDown={() => move(i, i + 1)}
                />
              ) : null;
            })}
          </SortableContext>
        </DndContext>
        {everyone && fixedRow(everyone)}
      </ul>
      {order.length === 0 && <p className="muted">{t("hub.admin.roles.order.none")}</p>}
      <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
        <button type="button" className="btn-primary" disabled={!changed || saving} onClick={save}>
          {saving ? t("modal.saving") : t("hub.admin.roles.order.save")}
        </button>
        {changed && (
          <button type="button" className="btn-secondary" disabled={saving} onClick={() => setOrder(initial)}>
            {t("hub.admin.roles.order.reset")}
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function SortableRole({
  role,
  first,
  last,
  onUp,
  onDown,
}: {
  role: RoleInfo;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id });
  return (
    <li
      ref={setNodeRef}
      className="role-order-item"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        background: "var(--surface)",
      }}
    >
      <span
        {...attributes}
        {...listeners}
        title={t("hub.admin.roles.order.drag", { name: role.name })}
        aria-label={t("hub.admin.roles.order.drag", { name: role.name })}
        style={{ cursor: "grab", color: "var(--text-muted)", touchAction: "none" }}
      >
        ⠿
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)" }}>{role.name}</span>
      <button type="button" className="btn-small btn-secondary" disabled={first} onClick={onUp} aria-label={t("hub.admin.roles.order.up", { name: role.name })}>
        ↑
      </button>
      <button type="button" className="btn-small btn-secondary" disabled={last} onClick={onDown} aria-label={t("hub.admin.roles.order.down", { name: role.name })}>
        ↓
      </button>
    </li>
  );
}
