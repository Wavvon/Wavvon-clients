import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRelative } from "@wavvon/core";
import type { Hub } from "../../types";
import type { HubNotice } from "../../hooks/useUnreadCounts";
import { Avatar } from "../Avatar";
import { FocusTrap } from "../FocusTrap";
import { PinIcon, PlusIcon, DiscoverIcon, TrashIcon, SearchIcon, ChevronIcon } from "../Icons";
import {
  DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  type HubFolder, type HubLayout, createFolder, deleteFolder, folderOf, isPinned, moveHubToFolder, togglePin,
} from "../../utils/hubLayout";

type Filter = "all" | "notified" | "pinned";

/** Drop target meaning "no folder". */
const NO_FOLDER = "";

function DraggableRow({ id, className, children }: { id: string; className: string; children: React.ReactNode }) {
  const { setNodeRef, listeners, isDragging, transform } = useDraggable({ id });
  return (
    <li
      ref={setNodeRef}
      className={`${className}${isDragging ? " dragging" : ""}`}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...listeners}
    >
      {children}
    </li>
  );
}

function DropZone({ id, className, children }: { id: string; className: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${id}` });
  return <div ref={setNodeRef} className={`${className}${isOver ? " drop-over" : ""}`}>{children}</div>;
}

/** A folder's tile: the first four hubs' colours in a 2×2 grid. */
export function FolderMosaic({ hubs }: { hubs: Hub[] }) {
  return (
    <span className="hub-folder-mosaic" aria-hidden="true">
      {hubs.slice(0, 4).map((h) => <Avatar key={h.hub_id} src={h.hub_icon} name={h.hub_name} pubkey={h.hub_id} size={8} />)}
    </span>
  );
}

/**
 * Every hub, opened from "Hubs · N": unpinned hubs (notified first, most
 * recent first), then folders, then pinned hubs. Every row can be pinned;
 * hubs are filed into folders by dragging them onto one.
 */
export function HubDrawer({
  hubs, layout, onLayoutChange, unreadByHub, noticeByHub, activeHubId, voiceHubId,
  onSwitchHub, onHubContextMenu, onAddHub, onDiscover, onClose,
}: {
  hubs: Hub[];
  layout: HubLayout;
  onLayoutChange: (layout: HubLayout) => void;
  unreadByHub: Record<string, number>;
  noticeByHub: Record<string, HubNotice>;
  activeHubId: string | null;
  voiceHubId?: string | null;
  onSwitchHub: (hubId: string) => void;
  onHubContextMenu: (e: React.MouseEvent, hub: Hub) => void;
  onAddHub?: () => void;
  onDiscover?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [naming, setNaming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // A short travel threshold keeps a plain click on a row opening the hub.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id;
    if (typeof over !== "string" || !over.startsWith("drop:")) return;
    const hubId = String(e.active.id);
    const target = over.slice("drop:".length);
    if ((folderOf(layout, hubId)?.id ?? NO_FOLDER) === target) return;
    onLayoutChange(moveHubToFolder(layout, hubId, target || null));
  }

  useEffect(() => {
    searchRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const count = (id: string) => unreadByHub[id] ?? 0;
  const notified = (h: Hub) => count(h.hub_id) > 0;
  const matches = (h: Hub) => !q || h.hub_name.toLowerCase().includes(q);
  const keep = (h: Hub) => matches(h) &&
    (filter === "all" || (filter === "notified" ? notified(h) : isPinned(layout, h.hub_id) || !!folderOf(layout, h.hub_id)));

  const groups = useMemo(() => {
    const loose = hubs.filter((h) => !isPinned(layout, h.hub_id) && !folderOf(layout, h.hub_id));
    const recent = (h: Hub) => noticeByHub[h.hub_id]?.at ?? 0;
    return {
      loose: [...loose.filter(notified).sort((a, b) => recent(b) - recent(a)), ...loose.filter((h) => !notified(h))],
      pinned: hubs.filter((h) => isPinned(layout, h.hub_id) && !folderOf(layout, h.hub_id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubs, layout, unreadByHub, noticeByHub]);

  const hubById = new Map(hubs.map((h) => [h.hub_id, h]));
  const membersOf = (f: HubFolder) => f.hubs.map((id) => hubById.get(id)).filter((h): h is Hub => !!h);
  const looseNotices = groups.loose.reduce((n, h) => n + count(h.hub_id), 0);
  const notifiedTotal = hubs.filter(notified).length;
  const pinnedTotal = layout.pinned.length;

  function open(hubId: string) {
    onSwitchHub(hubId);
    onClose();
  }

  function meta(h: Hub): { text: string; mention: boolean } | null {
    if (h.hub_id === activeHubId) return { text: t("hubs.you_are_here"), mention: false };
    const n = noticeByHub[h.hub_id];
    const c = count(h.hub_id);
    if (!n || c === 0) return null;
    const ago = formatRelative(Math.floor(n.at / 1000));
    return n.mention
      ? { text: t("hubs.mention_ago", { ago }), mention: true }
      : { text: t("hubs.messages_ago", { count: c, ago }), mention: false };
  }

  function pinButton(id: string, name: string) {
    const pinned = isPinned(layout, id);
    return (
      <button
        type="button"
        className="btn-icon hub-drawer-pin"
        aria-pressed={pinned}
        aria-label={t(pinned ? "hubs.drawer.unpin" : "hubs.drawer.pin", { name })}
        title={t(pinned ? "hubs.drawer.unpin" : "hubs.drawer.pin", { name })}
        onClick={() => onLayoutChange(togglePin(layout, id))}
      >
        <PinIcon size={14} />
      </button>
    );
  }

  function row(h: Hub, nested = false) {
    const c = count(h.hub_id);
    const m = meta(h);
    return (
      <DraggableRow
        key={h.hub_id}
        id={h.hub_id}
        className={`hub-drawer-row${h.hub_id === activeHubId ? " active" : ""}${nested ? " nested" : ""}`}
      >
        <button
          type="button"
          className="hub-drawer-open"
          title={`${h.hub_name} (${h.hub_url})`}
          onClick={() => open(h.hub_id)}
          onContextMenu={(e) => { e.preventDefault(); onHubContextMenu(e, h); }}
        >
          <Avatar src={h.hub_icon} name={h.hub_name} pubkey={h.hub_id} size={26} />
          <span className="hub-drawer-text">
            <span className={`hub-drawer-name${c > 0 || h.hub_id === activeHubId ? " strong" : ""}`}>{h.hub_name}</span>
            {m && <span className={`hub-drawer-meta${m.mention ? " mention" : ""}`}>{m.text}</span>}
          </span>
          {voiceHubId === h.hub_id && <span className="hub-tab-voice">{t("hubs.in_voice")}</span>}
          {c > 0 && (
            <span className={`hub-unread-pill${noticeByHub[h.hub_id]?.mention ? " mention" : ""}`}>{c > 99 ? "99+" : c}</span>
          )}
        </button>
        {pinButton(h.hub_id, h.hub_name)}
      </DraggableRow>
    );
  }

  const folders = layout.folders
    .map((f) => ({ f, members: membersOf(f), shown: membersOf(f).filter(keep) }))
    .filter(({ f, shown }) => shown.length > 0 || (!q && filter === "all") || (filter === "pinned" && isPinned(layout, f.id)));

  const loose = groups.loose.filter(keep);
  const pinned = groups.pinned.filter(keep);

  return (
    <div className="hub-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <FocusTrap>
        <aside className="hub-drawer" role="dialog" aria-modal="true" aria-label={t("hubs.drawer.title")}>
          <div className="hub-drawer-head">
            <div className="hub-drawer-title">
              <span>{t("hubs.drawer.title")}</span>
              <span className="hub-drawer-sub">{layout.folders.length > 0 ? t("hubs.drawer.summary", { hubs: hubs.length, folders: layout.folders.length }) : hubs.length}</span>
            </div>
            <label className="hub-drawer-search">
              <SearchIcon size={14} />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder={t("hubs.drawer.search")}
                aria-label={t("hubs.drawer.search")}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="hub-drawer-filters" role="group" aria-label={t("hubs.drawer.filter")}>
              {(["all", "notified", "pinned"] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? t("hubs.drawer.filter_all")
                    : f === "notified" ? t("hubs.drawer.filter_notified_n", { count: notifiedTotal })
                      : t("hubs.drawer.filter_pinned_n", { count: pinnedTotal })}
                </button>
              ))}
            </div>
          </div>

          <div className="hub-drawer-body">
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              {loose.length > 0 && (
                <DropZone id={NO_FOLDER} className="hub-drawer-section">
                  <h3 className="hub-drawer-heading">
                    {looseNotices > 0
                      ? t("hubs.drawer.unpinned_notices", { count: looseNotices })
                      : t("hubs.drawer.unpinned", { count: loose.length })}
                  </h3>
                  <ul className="hub-drawer-list">{loose.map((h) => row(h))}</ul>
                </DropZone>
              )}

              {folders.length > 0 && (
                <div className="hub-drawer-section">
                  <h3 className="hub-drawer-heading">{t("hubs.drawer.folders")}</h3>
                  <ul className="hub-drawer-list">
                    {folders.map(({ f, members, shown }) => {
                      const c = members.reduce((n, h) => n + count(h.hub_id), 0);
                      const mention = members.some((h) => noticeByHub[h.hub_id]?.mention && count(h.hub_id) > 0);
                      const isOpen = expanded === f.id || !!q;
                      return (
                        <li key={f.id}>
                          <DropZone id={f.id} className="hub-drawer-row folder">
                            <button
                              type="button"
                              className="hub-drawer-open"
                              aria-expanded={isOpen}
                              onClick={() => setExpanded((v) => (v === f.id ? null : f.id))}
                            >
                              <FolderMosaic hubs={members} />
                              <span className="hub-drawer-text">
                                <span className={`hub-drawer-name${c > 0 ? " strong" : ""}`}>{f.name}</span>
                                <span className="hub-drawer-meta">{t("hubs.drawer.folder_count", { count: members.length })}</span>
                              </span>
                              {c > 0 && <span className={`hub-unread-pill${mention ? " mention" : ""}`}>{c > 99 ? "99+" : c}</span>}
                              <ChevronIcon size={12} dir={isOpen ? "up" : "down"} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon hub-drawer-delete"
                              aria-label={t("hubs.drawer.delete_folder", { name: f.name })}
                              title={t("hubs.drawer.delete_folder", { name: f.name })}
                              onClick={() => onLayoutChange(deleteFolder(layout, f.id))}
                            >
                              <TrashIcon size={14} />
                            </button>
                            {pinButton(f.id, f.name)}
                          </DropZone>
                          {isOpen && (
                            <ul className="hub-drawer-list">
                              {shown.map((h) => row(h, true))}
                              {members.length === 0 && <li className="muted hub-drawer-drop-hint">{t("hubs.drawer.drop_here")}</li>}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {pinned.length > 0 && (
                <div className="hub-drawer-section">
                  <h3 className="hub-drawer-heading">{t("hubs.drawer.pinned_hubs")}</h3>
                  <ul className="hub-drawer-list">{pinned.map((h) => row(h))}</ul>
                </div>
              )}
            </DndContext>
          </div>

          <div className="hub-drawer-foot">
            <div className="hub-drawer-actions">
              {naming === null ? (
                <button type="button" className="hub-drawer-action" onClick={() => setNaming("")}>
                  <PlusIcon size={14} /> {t("hubs.drawer.new_folder")}
                </button>
              ) : (
                <form
                  className="hub-drawer-new-folder"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = naming.trim();
                    if (name) onLayoutChange(createFolder(layout, name.slice(0, 40), `f-${Date.now().toString(36)}`));
                    setNaming(null);
                  }}
                >
                  <input
                    autoFocus
                    value={naming}
                    maxLength={40}
                    placeholder={t("hubs.drawer.folder_name")}
                    aria-label={t("hubs.drawer.folder_name")}
                    onChange={(e) => setNaming(e.target.value)}
                  />
                  <button type="submit" className="primary">{t("hubs.drawer.create")}</button>
                </form>
              )}
              {onAddHub && (
                <button type="button" className="hub-drawer-action" onClick={() => { onClose(); onAddHub(); }}>
                  <PlusIcon size={14} /> {t("hub.join")}
                </button>
              )}
              {onDiscover && (
                <button type="button" className="hub-drawer-action" onClick={() => { onClose(); onDiscover(); }}>
                  <DiscoverIcon size={14} /> {t("hub.discover")}
                </button>
              )}
            </div>
            <p className="hub-drawer-note">{t("hubs.drawer.note")}</p>
          </div>
        </aside>
      </FocusTrap>
    </div>
  );
}
