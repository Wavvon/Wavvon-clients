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
import type { Hub, FavoriteHub } from "../../types";

interface Props {
  // The hubs the user has joined — the pool they pick favorites from.
  hubs: Hub[];
  favorites: FavoriteHub[];
  show: boolean;
  onToggleShow: (show: boolean) => void;
  onChange: (favorites: FavoriteHub[]) => void;
}

// Opt-in, drag-ordered list of hubs the user features on their profile.
// Favorites are keyed by hub url. Hidden by default (privacy): when the
// toggle is off, other members see nothing (the hub gates the list too).
export function FavoriteHubsEditor({ hubs, favorites, show, onToggleShow, onChange }: Props) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const available = hubs.filter((h) => !favorites.some((f) => f.url === h.hub_url));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = favorites.findIndex((f) => f.url === active.id);
    const to = favorites.findIndex((f) => f.url === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(favorites, from, to));
  }

  function addHub(url: string) {
    const h = hubs.find((x) => x.hub_url === url);
    if (!h || favorites.some((f) => f.url === url)) return;
    onChange([...favorites, { url: h.hub_url, name: h.hub_name, icon: h.hub_icon }]);
  }

  function removeHub(url: string) {
    onChange(favorites.filter((f) => f.url !== url));
  }

  return (
    <div>
      <label className="settings-row" style={{ gap: "var(--space-2)", alignItems: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={show} onChange={(e) => onToggleShow(e.target.checked)} />
        <span style={{ fontSize: "var(--text-sm)" }}>{t("settings.profile.hubs.show_toggle")}</span>
      </label>

      {!show ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 8 }}>
          {t("settings.profile.hubs.hidden_note")}
        </p>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {favorites.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {t("settings.profile.hubs.empty")}
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={favorites.map((f) => f.url)} strategy={verticalListSortingStrategy}>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {favorites.map((f) => (
                    <FavoriteRow key={f.url} fav={f} onRemove={() => removeHub(f.url)} removeLabel={t("settings.profile.hubs.remove")} dragLabel={t("settings.profile.hubs.drag_hint")} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {available.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addHub(e.target.value);
              }}
              aria-label={t("settings.profile.hubs.add")}
              style={{ maxWidth: 280, alignSelf: "flex-start" }}
            >
              <option value="">{t("settings.profile.hubs.add")}</option>
              {available.map((h) => (
                <option key={h.hub_id} value={h.hub_url}>
                  {h.hub_name || h.hub_url}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function FavoriteRow({
  fav,
  onRemove,
  removeLabel,
  dragLabel,
}: {
  fav: FavoriteHub;
  onRemove: () => void;
  removeLabel: string;
  dragLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fav.url });
  return (
    <li
      ref={setNodeRef}
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
        title={dragLabel}
        aria-label={dragLabel}
        style={{ cursor: "grab", color: "var(--text-muted)", touchAction: "none" }}
      >
        ⠿
      </span>
      {fav.icon ? (
        <img src={fav.icon} alt="" width={20} height={20} style={{ borderRadius: 4, objectFit: "cover" }} />
      ) : (
        <span
          aria-hidden="true"
          style={{ width: 20, height: 20, borderRadius: 4, background: "var(--bg-elevated)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-xs)" }}
        >
          {(fav.name || "?").charAt(0).toUpperCase()}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--text-sm)" }}>
        {fav.name || fav.url}
      </span>
      <button type="button" className="btn-small btn-secondary" onClick={onRemove} aria-label={removeLabel} title={removeLabel} style={{ flexShrink: 0 }}>
        ×
      </button>
    </li>
  );
}
