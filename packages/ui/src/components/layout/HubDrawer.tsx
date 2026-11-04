import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub } from "../../types";
import type { HubNotice } from "../../hooks/useUnreadCounts";
import { Avatar } from "../Avatar";
import { FocusTrap } from "../FocusTrap";
import { PinIcon, PlusIcon, DiscoverIcon, TrashIcon } from "../Icons";
import {
  type HubLayout, createFolder, deleteFolder, folderOf, isPinned, moveHubToFolder, togglePin,
} from "../../utils/hubLayout";

type Filter = "all" | "notified" | "pinned";

/**
 * Every hub, opened from "Hubs · N": unpinned hubs with notifications first
 * (most recent first), then the other unpinned ones, then folders, then
 * pinned hubs. Every row can be pinned; hubs can be filed into folders.
 */
export function HubDrawer({
  hubs, layout, onLayoutChange, unreadByHub, noticeByHub, activeHubId,
  onSwitchHub, onHubContextMenu, onAddHub, onDiscover, onClose,
}: {
  hubs: Hub[];
  layout: HubLayout;
  onLayoutChange: (layout: HubLayout) => void;
  unreadByHub: Record<string, number>;
  noticeByHub: Record<string, HubNotice>;
  activeHubId: string | null;
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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const matches = (h: Hub) => !q || h.hub_name.toLowerCase().includes(q);
  const notified = (h: Hub) => (unreadByHub[h.hub_id] ?? 0) > 0;
  const keep = (h: Hub) => matches(h) &&
    (filter === "all" || (filter === "notified" ? notified(h) : isPinned(layout, h.hub_id)));

  const groups = useMemo(() => {
    const loose = hubs.filter((h) => !isPinned(layout, h.hub_id) && !folderOf(layout, h.hub_id));
    const recent = (h: Hub) => noticeByHub[h.hub_id]?.at ?? 0;
    return {
      notified: loose.filter(notified).sort((a, b) => recent(b) - recent(a)),
      quiet: loose.filter((h) => !notified(h)),
      pinned: hubs.filter((h) => isPinned(layout, h.hub_id) && !folderOf(layout, h.hub_id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubs, layout, unreadByHub, noticeByHub]);

  function open(hubId: string) {
    onSwitchHub(hubId);
    onClose();
  }

  function row(h: Hub) {
    const count = unreadByHub[h.hub_id] ?? 0;
    const pinned = isPinned(layout, h.hub_id);
    return (
      <li key={h.hub_id} className={`hub-drawer-row${h.hub_id === activeHubId ? " active" : ""}`}>
        <button
          type="button"
          className="hub-drawer-open"
          onClick={() => open(h.hub_id)}
          onContextMenu={(e) => { e.preventDefault(); onHubContextMenu(e, h); }}
        >
          <Avatar src={h.hub_icon} name={h.hub_name} pubkey={h.hub_id} size={28} />
          <span className="hub-drawer-name">{h.hub_name}</span>
          {count > 0 && (
            <span className={`hub-unread-pill${noticeByHub[h.hub_id]?.mention ? " mention" : ""}`}>{count > 99 ? "99+" : count}</span>
          )}
        </button>
        {layout.folders.length > 0 && (
          <select
            className="hub-drawer-folder"
            aria-label={t("hubs.drawer.folder_of", { name: h.hub_name })}
            value={folderOf(layout, h.hub_id)?.id ?? ""}
            onChange={(e) => onLayoutChange(moveHubToFolder(layout, h.hub_id, e.target.value || null))}
          >
            <option value="">{t("hubs.drawer.no_folder")}</option>
            {layout.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <button
          type="button"
          className="btn-icon hub-drawer-pin"
          aria-pressed={pinned}
          aria-label={t(pinned ? "hubs.drawer.unpin" : "hubs.drawer.pin", { name: h.hub_name })}
          title={t(pinned ? "hubs.drawer.unpin" : "hubs.drawer.pin", { name: h.hub_name })}
          onClick={() => onLayoutChange(togglePin(layout, h.hub_id))}
        >
          <PinIcon size={14} />
        </button>
      </li>
    );
  }

  const folders = layout.folders
    .map((f) => ({ f, hubs: hubs.filter((h) => f.hubs.includes(h.hub_id) && keep(h)) }))
    .filter(({ f, hubs: hs }) => hs.length > 0 || (!q && filter !== "notified" && (filter === "all" || isPinned(layout, f.id))));

  return (
    <div className="hub-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <FocusTrap>
        <aside className="hub-drawer" role="dialog" aria-modal="true" aria-label={t("hubs.drawer.title")}>
          <div className="hub-drawer-head">
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t("hubs.drawer.search")}
              aria-label={t("hubs.drawer.search")}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="hub-drawer-filters" role="group" aria-label={t("hubs.drawer.filter")}>
              {(["all", "notified", "pinned"] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {t(f === "all" ? "hubs.drawer.filter_all" : f === "notified" ? "hubs.drawer.filter_notified" : "hubs.drawer.filter_pinned")}
                </button>
              ))}
            </div>
          </div>

          <ul className="hub-drawer-list">
            {[...groups.notified, ...groups.quiet].filter(keep).map(row)}
          </ul>

          {folders.map(({ f, hubs: hs }) => (
            <section key={f.id} className="hub-drawer-folder-group">
              <div className="hub-drawer-folder-head">
                <span>{f.name}</span>
                <button
                  type="button"
                  className="btn-icon hub-drawer-pin"
                  aria-pressed={isPinned(layout, f.id)}
                  aria-label={t(isPinned(layout, f.id) ? "hubs.drawer.unpin" : "hubs.drawer.pin", { name: f.name })}
                  onClick={() => onLayoutChange(togglePin(layout, f.id))}
                >
                  <PinIcon size={14} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label={t("hubs.drawer.delete_folder", { name: f.name })}
                  title={t("hubs.drawer.delete_folder", { name: f.name })}
                  onClick={() => onLayoutChange(deleteFolder(layout, f.id))}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
              <ul className="hub-drawer-list">{hs.map(row)}</ul>
            </section>
          ))}

          {groups.pinned.filter(keep).length > 0 && (
            <section className="hub-drawer-folder-group">
              <div className="hub-drawer-folder-head"><span>{t("hubs.drawer.pinned")}</span></div>
              <ul className="hub-drawer-list">{groups.pinned.filter(keep).map(row)}</ul>
            </section>
          )}

          <div className="hub-drawer-actions">
            {naming === null ? (
              <button type="button" className="btn-secondary" onClick={() => setNaming("")}>
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
              <button type="button" className="btn-secondary" onClick={() => { onClose(); onAddHub(); }}>
                <PlusIcon size={14} /> {t("hub.join")}
              </button>
            )}
            {onDiscover && (
              <button type="button" className="btn-secondary" onClick={() => { onClose(); onDiscover(); }}>
                <DiscoverIcon size={14} /> {t("hub.discover")}
              </button>
            )}
          </div>
        </aside>
      </FocusTrap>
    </div>
  );
}
