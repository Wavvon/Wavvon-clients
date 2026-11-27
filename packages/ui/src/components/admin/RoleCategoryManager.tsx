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
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { RoleCategory } from "../../types";
import { FocusTrap } from "../FocusTrap";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";
import { RoleCategoryRow } from "./RoleCategoryRow";
import { CloseIcon } from "../Icons";

export interface RoleCategoryManagerActions {
  createRoleCategory: (input: { name: string; position: number }) => Promise<RoleCategory>;
  updateRoleCategory: (
    id: string,
    updates: { name?: string; color?: string | null; icon?: string | null; position?: number },
  ) => Promise<RoleCategory>;
  deleteRoleCategory: (id: string) => Promise<void>;
}

interface Props {
  categories: RoleCategory[];
  /** Roles per category id; the key "" counts the roles with none. */
  roleCounts: Map<string, number>;
  onChange: (categories: RoleCategory[]) => void;
  actions: RoleCategoryManagerActions;
  onClose: () => void;
}

/** Dialog for the hub's role categories: order, rename, delete, add. A deleted
 *  category's roles fall back to "No category", which is always last. */
export function RoleCategoryManager({ categories, roleCounts, onChange, actions, onClose }: Props) {
  const { t } = useTranslation();
  useCloseOnEscape(onClose);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sorted = categories.slice().sort((a, b) => a.position - b.position);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  }

  const replace = (u: RoleCategory) => onChange(categories.map((c) => (c.id === u.id ? u : c)));

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    await run(async () => {
      const position = sorted.length ? sorted[sorted.length - 1].position + 1 : 0;
      onChange([...categories, await actions.createRoleCategory({ name, position })]);
      setNewName("");
    });
    setBusy(false);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = sorted.map((c) => c.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    void run(async () => {
      const updated = await Promise.all(
        next.map((id, position) => {
          const cat = sorted.find((c) => c.id === id)!;
          return cat.position === position ? Promise.resolve(cat) : actions.updateRoleCategory(id, { position });
        }),
      );
      onChange(updated);
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("hub.admin.roles.cat.title")}>
      <FocusTrap>
        <div className="modal roles-cat-modal" onClick={(e) => e.stopPropagation()}>
          <div className="roles-cat-head">
            <div>
              <h3>{t("hub.admin.roles.cat.heading")}</h3>
              <p className="muted">{t("hub.admin.roles.cat.hint")}</p>
            </div>
            <button type="button" className="btn-ghost" onClick={onClose} aria-label={t("modal.close")}><CloseIcon size={13} /></button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="roles-cat-list">
                {sorted.map((c) => (
                  <RoleCategoryRow
                    key={c.id}
                    category={c}
                    roleCount={roleCounts.get(c.id) ?? 0}
                    onUpdate={(u) => void run(async () => replace(await actions.updateRoleCategory(c.id, u)))}
                    onDelete={() =>
                      void run(async () => {
                        await actions.deleteRoleCategory(c.id);
                        onChange(categories.filter((x) => x.id !== c.id));
                      })
                    }
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <div className="roles-cat-line roles-cat-fixed">
            <span className="roles-row-handle fixed" aria-hidden="true" />
            <span className="roles-cat-name">{t("hub.admin.roles.category_none")}</span>
            <span className="roles-cat-count">{t("hub.admin.roles.cat.none_count", { count: roleCounts.get("") ?? 0 })}</span>
          </div>
          <div className="settings-row roles-cat-new">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder={t("hub.admin.roles.cat.new_placeholder")}
              aria-label={t("hub.admin.role_categories.new_name_placeholder")}
            />
            <button type="button" className="btn-secondary" onClick={() => void add()} disabled={busy || !newName.trim()}>
              {t("hub.admin.roles.cat.add")}
            </button>
          </div>
          <p className="muted roles-cat-foot">{t("hub.admin.roles.cat.foot")}</p>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              {t("hub.admin.roles.cat.done")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
