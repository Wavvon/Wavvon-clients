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
  onChange: (categories: RoleCategory[]) => void;
  actions: RoleCategoryManagerActions;
  onClose: () => void;
}

/** Dialog for the hub's role categories: order, rename, delete, add. A deleted
 *  category's roles fall back to "No category", which is always last. */
export function RoleCategoryManager({ categories, onChange, actions, onClose }: Props) {
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
          <h3>{t("hub.admin.roles.cat.title")}</h3>
          <p className="muted">{t("hub.admin.role_categories.hint")}</p>
          {error && <p className="error-text">{error}</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="roles-list">
                {sorted.map((c) => (
                  <RoleCategoryRow
                    key={c.id}
                    category={c}
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
          <p className="muted roles-cat-fixed">{t("hub.admin.roles.category_none")}</p>
          <div className="settings-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder={t("hub.admin.role_categories.new_name_placeholder")}
              aria-label={t("hub.admin.role_categories.new_name_placeholder")}
            />
            <button type="button" onClick={() => void add()} disabled={busy || !newName.trim()}>
              {t("hub.admin.roles.cat.add")}
            </button>
          </div>
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
