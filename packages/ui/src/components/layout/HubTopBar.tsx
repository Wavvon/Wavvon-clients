import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { formatRelative } from "@wavvon/core";
import type { Hub, NotifyMode } from "../../types";
import type { HubNotice } from "../../hooks/useUnreadCounts";
import { Avatar } from "../Avatar";
import { SortableHubIcon } from "../SortableItems";
import { MessagesIcon, SearchIcon, ClockIcon, BellOffIcon, MenuIcon, ChevronIcon } from "../Icons";
import { UserMenu, type UserMenuProps } from "./UserMenu";
import { HubDrawer, FolderMosaic } from "./HubDrawer";
import { HubContextMenu } from "./HubContextMenu";
import { formatMuteEnd } from "./MuteForItems";
import {
  type HubLayout, badgeHome, moveHubToFolder, movePinned, tabBadges,
} from "../../utils/hubLayout";

export interface HubTopBarProps {
  hubs: Hub[];
  activeHubId: string | null;
  view: "channels" | "dms";
  /** False in the hub build: one hub, so no tabs and no drawer. */
  multiHub: boolean;
  layout: HubLayout;
  onLayoutChange: (layout: HubLayout) => void;
  unreadByHub: Record<string, number>;
  noticeByHub: Record<string, HubNotice>;
  unreadDmCount: number;
  pingByHub: Record<string, number | null>;
  hubNotifyMode: Record<string, NotifyMode>;
  hubMuteUntil?: Record<string, number>;
  lobbyHubIds?: Set<string>;
  /** The hub whose voice channel you are in, marked on its tab. */
  voiceHubId?: string | null;
  onSwitchToDms: () => void;
  /** Leaves the DM view for the active hub's channels, keeping the selected channel. */
  onBackToChannels: () => void;
  onSwitchHub: (hubId: string) => void;
  onRemoveHub: (hubId: string) => void;
  onSetHubNotifyMode?: (hubId: string, mode: NotifyMode) => void;
  onMuteHubUntil?: (hubId: string, until: number) => void;
  onOpenSearch: () => void;
  /** Opens the personal Saved list. */
  onOpenSaved?: () => void;
  /** Reminders that came due and wait in the Saved list. */
  savedDueCount?: number;
  onAddHub?: () => void;
  onDiscover?: () => void;
  userMenu: UserMenuProps;
}

function Count({ count, mention }: { count: number; mention: boolean }) {
  if (count === 0) return null;
  return <span className={`hub-unread-pill${mention ? " mention" : ""}`} aria-hidden="true">{count > 99 ? "99+" : count}</span>;
}

/**
 * The app's top bar: direct messages, "Hubs · N", the pinned tabs, search and
 * the member's avatar. A notification is counted in exactly one place.
 */
export function HubTopBar(p: HubTopBarProps) {
  const { t } = useTranslation();
  const [drawer, setDrawer] = useState(false);
  const [folderOpen, setFolderOpen] = useState<string | null>(null);
  const [folderQuery, setFolderQuery] = useState("");
  // The tab strip scrolls horizontally, which clips anything absolutely
  // positioned inside it, so the folder menu is placed with fixed coordinates.
  const [folderAt, setFolderAt] = useState({ left: 0, top: 0 });
  const [ctx, setCtx] = useState<{ hub: Hub; x: number; y: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const hubIds = p.hubs.map((h) => h.hub_id);
  const mentionByHub = Object.fromEntries(Object.entries(p.noticeByHub).map(([h, n]) => [h, n.mention]));
  const badges = tabBadges(p.layout, hubIds, p.unreadByHub, mentionByHub);
  const hubById = new Map(p.hubs.map((h) => [h.hub_id, h]));
  const tabs = p.layout.pinned.filter((id) => hubById.has(id) || p.layout.folders.some((f) => f.id === id));
  const onChannels = p.view === "channels";
  // The hub you are in always has a tab: a transient one when nothing pinned speaks for it.
  const activeHub = p.activeHubId ? hubById.get(p.activeHubId) : undefined;
  const transient = activeHub && !badgeHome(p.layout, activeHub.hub_id) ? activeHub : undefined;

  function onDragEnd(e: DragEndEvent) {
    const from = String(e.active.id);
    const to = e.over ? String(e.over.id) : null;
    if (!to || from === to) return;
    // A hub dropped on a folder goes into it; anything else reorders.
    if (hubById.has(from) && p.layout.folders.some((f) => f.id === to)) {
      p.onLayoutChange(moveHubToFolder(p.layout, from, to));
    } else {
      p.onLayoutChange(movePinned(p.layout, from, to));
    }
  }

  function openContext(e: React.MouseEvent, hub: Hub) {
    e.preventDefault();
    setCtx({ hub, x: e.clientX, y: e.clientY });
  }

  function hubTab(h: Hub) {
    const active = onChannels && h.hub_id === p.activeHubId;
    const offline = p.pingByHub[h.hub_id] === null;
    const b = badges.tabs[h.hub_id];
    return (
      <SortableHubIcon key={h.hub_id} hubId={h.hub_id}>
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className={`hub-tab${active ? " active" : ""}${offline ? " offline" : ""}`}
          title={`${h.hub_name} (${h.hub_url})${offline ? t("hub.offline_suffix") : ""}`}
          onClick={() => p.onSwitchHub(h.hub_id)}
          onContextMenu={(e) => openContext(e, h)}
        >
          <Avatar src={h.hub_icon} name={h.hub_name} pubkey={h.hub_id} size={22} />
          {active && <span className="hub-tab-name">{h.hub_name}</span>}
          {active && p.voiceHubId === h.hub_id && <span className="hub-tab-voice">{t("hubs.in_voice")}</span>}
          {p.lobbyHubIds?.has(h.hub_id) && <span className="hub-tab-mark" title={t("lobby.sidebar_hint")}><ClockIcon size={10} /></span>}
          {p.hubNotifyMode[h.hub_id] === "silent" && <span className="hub-tab-mark" title={p.hubMuteUntil?.[h.hub_id] ? t("hub.mute.until", { time: formatMuteEnd(p.hubMuteUntil[h.hub_id]) }) : t("hub.notifications.silent")}><BellOffIcon size={10} /></span>}
          {b && p.hubNotifyMode[h.hub_id] !== "silent" && <Count {...b} />}
        </button>
      </SortableHubIcon>
    );
  }

  function folderTab(id: string) {
    const f = p.layout.folders.find((x) => x.id === id)!;
    const members = f.hubs.map((h) => hubById.get(h)).filter((h): h is Hub => !!h);
    const current = onChannels && p.activeHubId && f.hubs.includes(p.activeHubId) ? hubById.get(p.activeHubId) : undefined;
    const b = badges.tabs[f.id];
    const recent = (h: Hub) => p.noticeByHub[h.hub_id]?.at ?? 0;
    const isOpen = folderOpen === f.id;
    const fq = folderQuery.trim().toLowerCase();
    return (
      <SortableHubIcon key={f.id} hubId={f.id}>
        <div className="hub-folder">
          <button
            type="button"
            role="tab"
            aria-selected={!!current}
            aria-haspopup="menu"
            aria-expanded={folderOpen === f.id}
            className={`hub-tab folder${current ? " active" : ""}`}
            title={f.name}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setFolderAt({ left: r.left, top: r.bottom });
              setFolderQuery("");
              setFolderOpen((v) => (v === f.id ? null : f.id));
            }}
          >
            <FolderMosaic hubs={members} />
            {(current || isOpen) && (
              <span className="hub-tab-name">
                {f.name}
                {current && <span className="hub-tab-sub"> › {current.hub_name}</span>}
              </span>
            )}
            {(current || isOpen) && <ChevronIcon size={12} dir={isOpen ? "up" : "down"} />}
            {b && !(current || isOpen) && <Count {...b} />}
          </button>
          {isOpen && <div className="hub-folder-backdrop" onClick={() => setFolderOpen(null)} />}
          {isOpen && (
            <div className="hub-folder-menu" role="menu" aria-label={f.name} style={folderAt}>
              <div className="hub-folder-menu-head">
                <div className="hub-drawer-title">
                  <span>{f.name}</span>
                  <span className="hub-drawer-sub">{t("hubs.folder_summary", { count: members.length })}</span>
                </div>
                <label className="hub-drawer-search">
                  <SearchIcon size={14} />
                  <input
                    type="search"
                    autoFocus
                    value={folderQuery}
                    placeholder={t("hubs.folder_search", { name: f.name })}
                    aria-label={t("hubs.folder_search", { name: f.name })}
                    onChange={(e) => setFolderQuery(e.target.value)}
                  />
                </label>
              </div>
              <h3 className="hub-drawer-heading">{t("hubs.in_this_folder")}</h3>
              <div className="hub-folder-menu-list">
                {[...members].filter((h) => !fq || h.hub_name.toLowerCase().includes(fq)).sort((a, b2) => recent(b2) - recent(a)).map((h) => {
                  const n = p.noticeByHub[h.hub_id];
                  const count = p.unreadByHub[h.hub_id] ?? 0;
                  const here = onChannels && h.hub_id === p.activeHubId;
                  const ago = n ? formatRelative(Math.floor(n.at / 1000)) : "";
                  return (
                    <button
                      key={h.hub_id}
                      type="button"
                      role="menuitem"
                      className={`hub-folder-item${here ? " here" : ""}`}
                      onClick={() => { setFolderOpen(null); p.onSwitchHub(h.hub_id); }}
                      onContextMenu={(e) => openContext(e, h)}
                    >
                      <Avatar src={h.hub_icon} name={h.hub_name} pubkey={h.hub_id} size={26} />
                      <span className="hub-folder-item-text">
                        <span className={count > 0 || here ? "strong" : undefined}>{h.hub_name}</span>
                        {(here || (n && count > 0)) && (
                          <span className={`hub-folder-item-sub${!here && n?.mention ? " mention" : ""}`}>
                            {here
                              ? t("hubs.you_are_here")
                              : t(n!.mention ? "hubs.mention_ago" : "hubs.messages_ago", { count, ago })}
                          </span>
                        )}
                      </span>
                      {p.voiceHubId === h.hub_id && <span className="hub-tab-voice">{t("hubs.in_voice")}</span>}
                      <Count count={count} mention={!!n?.mention} />
                    </button>
                  );
                })}
                {members.length === 0 && <p className="muted hub-folder-empty">{t("hubs.folder_empty")}</p>}
              </div>
              <p className="hub-drawer-note hub-folder-note">{t("hubs.folder_note")}</p>
            </div>
          )}
        </div>
      </SortableHubIcon>
    );
  }

  return (
    <header className="top-bar">
      <button
        type="button"
        className={`top-bar-btn top-bar-dms${p.view === "dms" ? " active" : ""}`}
        onClick={p.onSwitchToDms}
        title={t("dm.header.title")}
        aria-label={t("dm.header.title")}
      >
        <MessagesIcon size={16} />
        <Count count={p.unreadDmCount} mention={false} />
      </button>

      {/* The hub build has no tabs, so its one hub gets a plain tab: without
          it nothing leads back from the DM view. No drag, no context menu —
          removing the hub that serves this client makes no sense. */}
      {!p.multiHub && activeHub && (
        <div className="hub-tabs" role="tablist" aria-label={t("hubs.tabs")}>
          <button
            type="button"
            role="tab"
            aria-selected={onChannels}
            className={`hub-tab${onChannels ? " active" : ""}`}
            title={activeHub.hub_name}
            onClick={p.onBackToChannels}
          >
            <Avatar src={activeHub.hub_icon} name={activeHub.hub_name} pubkey={activeHub.hub_id} size={22} />
            <span className="hub-tab-name">{activeHub.hub_name}</span>
          </button>
        </div>
      )}

      {p.multiHub && (
        <>
          <button type="button" className={`top-bar-hubs${drawer ? " open" : ""}`} aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <MenuIcon size={14} />
            {t("hubs.button", { count: p.hubs.length })}
            <Count {...badges.rest} />
          </button>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
              <div className="hub-tabs" role="tablist" aria-label={t("hubs.tabs")}>
                {tabs.map((id) => (hubById.has(id) ? hubTab(hubById.get(id)!) : folderTab(id)))}
                {transient && hubTab(transient)}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <div className="top-bar-spacer" />
      <button type="button" className="top-bar-search" onClick={p.onOpenSearch} aria-keyshortcuts="Control+K">
        <SearchIcon size={14} />
        <span>{t("hubs.search_everywhere")}</span>
        <kbd className="hint-fine">Ctrl K</kbd>
      </button>
      <UserMenu {...p.userMenu} onOpenSaved={p.onOpenSaved} savedDueCount={p.savedDueCount} />

      {drawer && (
        <HubDrawer
          hubs={p.hubs}
          layout={p.layout}
          onLayoutChange={p.onLayoutChange}
          unreadByHub={p.unreadByHub}
          noticeByHub={p.noticeByHub}
          activeHubId={onChannels ? p.activeHubId : null}
          voiceHubId={p.voiceHubId}
          onSwitchHub={p.onSwitchHub}
          onHubContextMenu={openContext}
          onAddHub={p.onAddHub}
          onDiscover={p.onDiscover}
          onClose={() => setDrawer(false)}
        />
      )}
      {ctx && (
        <HubContextMenu
          hub={ctx.hub}
          x={ctx.x}
          y={ctx.y}
          mode={p.hubNotifyMode[ctx.hub.hub_id] ?? "all"}
          muteUntil={p.hubMuteUntil?.[ctx.hub.hub_id]}
          onSetMode={p.onSetHubNotifyMode}
          onMuteUntil={p.onMuteHubUntil}
          onRemove={p.onRemoveHub}
          onClose={() => setCtx(null)}
        />
      )}
    </header>
  );
}

