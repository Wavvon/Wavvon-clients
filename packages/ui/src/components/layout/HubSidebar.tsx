import React, { useState, useRef, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";
import type { Hub, NotifyMode } from "../../types";
import { SortableHubIcon } from "../SortableItems";

interface Props {
  hubs: Hub[];
  activeHubId: string | null;
  view: "channels" | "dms";
  showDiscover: boolean;
  unreadDms: Record<string, boolean>;
  unreadByHub: Record<string, number>;
  pingByHub: Record<string, number | null>;
  hubNotifyMode: Record<string, NotifyMode>;
  /** Hubs whose session is confined to the lobby (lobby-survey.md
   * Feature 1) — rendered with a small persistent badge that disappears
   * once the background PoW promotes the session, even for hubs the user
   * has navigated away from. */
  lobbyHubIds?: Set<string>;
  hasActiveHub: boolean;
  onSwitchToDms: () => void;
  onSwitchHub: (hubId: string) => void;
  onRemoveHub: (hubId: string) => void;
  /** Per-hub notification mode, set from the icon's right-click menu. */
  onSetHubNotifyMode?: (hubId: string, mode: NotifyMode) => void;
  onHubReorder: (event: DragEndEvent) => void;
  /** Both unset hides the `+` entirely — the hub build has no second hub to
   *  add and no wizard to reach. */
  onAddHub?: () => void;
  /** Absent when no hub directory is configured, and then the ⊕ button is
   *  not rendered at all — the sidebar had a permanent entry to a page that
   *  fetched a hostname which does not resolve. */
  onDiscover?: () => void;
}

interface HubContextMenu {
  hubId: string;
  x: number;
  y: number;
}

export function HubSidebar({
  hubs, activeHubId, view, showDiscover, unreadDms, unreadByHub, pingByHub,
  hubNotifyMode, lobbyHubIds, hasActiveHub,
  onSwitchToDms, onSwitchHub, onRemoveHub, onSetHubNotifyMode,
  onHubReorder, onAddHub, onDiscover,
}: Props) {
  const { t } = useTranslation();
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [focusedIndex, setFocusedIndex] = useState(0);
  const hubButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hubContextMenu, setHubContextMenu] = useState<HubContextMenu | null>(null);

  const handleHubKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(index + 1, hubs.length - 1);
      setFocusedIndex(next);
      hubButtonRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(index - 1, 0);
      setFocusedIndex(prev);
      hubButtonRefs.current[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
      hubButtonRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = hubs.length - 1;
      setFocusedIndex(last);
      hubButtonRefs.current[last]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSwitchHub(hubs[index].hub_id);
    }
  }, [hubs, onSwitchHub]);

  const contextHub = hubContextMenu
    ? hubs.find((h) => h.hub_id === hubContextMenu.hubId)
    : null;
  const currentMode = hubContextMenu
    ? (hubNotifyMode[hubContextMenu.hubId] ?? "all")
    : "all";

  return (
    <nav className="hub-sidebar" aria-label={t("hub.sidebar.aria")}>
      <div className="hub-icon-box">
        <button
          className={`hub-icon dm ${view === "dms" ? "active" : ""}`}
          onClick={onSwitchToDms}
          disabled={!hasActiveHub}
          title={t("dm.header.title")}
        >
          @
        </button>
        {Object.keys(unreadDms).length > 0 && view !== "dms" && (
          <span className="hub-unread-badge" aria-hidden="true">
            {Object.keys(unreadDms).length > 99 ? "99+" : Object.keys(unreadDms).length}
          </span>
        )}
      </div>
      <div className="hub-sidebar-divider" />
      <DndContext sensors={dndSensors} onDragEnd={onHubReorder}>
        <SortableContext items={hubs.map((h) => h.hub_id)} strategy={verticalListSortingStrategy}>
          <div role="tablist" aria-label={t("hub.sidebar.list_aria")} aria-orientation="vertical">
            {hubs.map((h, index) => {
              const unread = unreadByHub[h.hub_id] || 0;
              const ping = pingByHub[h.hub_id];
              const offline = ping === null;
              const titleSuffix = offline ? t("hub.offline_suffix") : ping === undefined ? "" : ` — ${ping}ms`;
              const isFocused = focusedIndex === index;
              const isActive = h.hub_id === activeHubId && view === "channels";
              return (
                <SortableHubIcon key={h.hub_id} hubId={h.hub_id}>
                  <div className="hub-icon-box">
                    <button
                      ref={(el) => { hubButtonRefs.current[index] = el; }}
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isFocused ? 0 : -1}
                      className={`hub-icon ${
                        isActive ? "active" : ""
                      } ${offline ? "offline" : ""} ${
                        hubNotifyMode[h.hub_id] === "silent" ? "muted" : ""
                      }`}
                      onClick={() => { setFocusedIndex(index); onSwitchHub(h.hub_id); }}
                      onKeyDown={(e) => handleHubKeyDown(e, index)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setHubContextMenu({ hubId: h.hub_id, x: e.clientX, y: e.clientY });
                      }}
                      title={`${h.hub_name} (${h.hub_url})${titleSuffix}${
                        hubNotifyMode[h.hub_id] === "silent"
                          ? t("hub.silenced_suffix")
                          : hubNotifyMode[h.hub_id] === "mentions"
                          ? t("hub.mentions_suffix")
                          : ""
                      }`}
                    >
                      {h.hub_icon ? (
                        <img src={h.hub_icon} alt={h.hub_name} className="hub-icon-image" />
                      ) : (
                        h.hub_name.slice(0, 2).toUpperCase()
                      )}
                    </button>
                    {unread > 0 && hubNotifyMode[h.hub_id] !== "silent" && (
                      <span className="hub-unread-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
                    )}
                    {lobbyHubIds?.has(h.hub_id) && (
                      <span className="hub-muted-badge" title={t("lobby.sidebar_hint")}>🕒</span>
                    )}
                    {hubNotifyMode[h.hub_id] === "silent" && (
                      <span className="hub-muted-badge" title={t("hub.notifications.silent")} aria-hidden="true">🔕</span>
                    )}
                    {hubNotifyMode[h.hub_id] === "mentions" && (
                      <span className="hub-muted-badge" title={t("hub.notifications.mentions")} aria-hidden="true">@</span>
                    )}
                  </div>
                  {offline && <span className="hub-offline-label" aria-hidden="true">offline</span>}
                </SortableHubIcon>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {onAddHub && (
        <button className="hub-icon add" onClick={onAddHub} title={t("hub.join")}>
          +
        </button>
      )}

      {onDiscover && (
        <>
          <div className="hub-sidebar-divider" />
          <button
            className={`hub-icon discover ${showDiscover ? "active" : ""}`}
            onClick={onDiscover}
            title={t("hub.discover")}
          >
            ⊕
          </button>
        </>
      )}
      {hubContextMenu && contextHub && (
        <div
          className="context-menu-overlay"
          onClick={() => setHubContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setHubContextMenu(null); }}
        >
          <div
            className="context-menu"
            style={{ top: hubContextMenu.y, left: hubContextMenu.x }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label={`${contextHub.hub_name} options`}
          >
            <div className="context-menu-header">{contextHub.hub_name}</div>
            <div style={{ padding: "4px 12px 2px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              {t("hub.notifications")}
            </div>
            {(["all", "mentions", "silent"] as NotifyMode[]).map((mode) => (
              <button
                key={mode}
                className={`context-menu-item${currentMode === mode ? " context-menu-item-active" : ""}`}
                role="menuitemradio"
                aria-checked={currentMode === mode}
                onClick={() => {
                  onSetHubNotifyMode?.(hubContextMenu.hubId, mode);
                  setHubContextMenu(null);
                }}
              >
                {t(`hub.notifications.${mode}`)}
                {currentMode === mode && " ✓"}
              </button>
            ))}
            <div className="context-menu-separator" />
            <button
              className="context-menu-item danger"
              onClick={() => { setHubContextMenu(null); onRemoveHub(hubContextMenu.hubId); }}
            >
              {t("hub.leave")}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
