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
import type { Hub, NotifyMode } from "@shared/types";
import { SortableHubIcon } from "@components/common/SortableItems";

interface Props {
  hubs: Hub[];
  activeHubId: string | null;
  view: "channels" | "dms";
  showDiscover: boolean;
  unreadDms: Record<string, boolean>;
  unreadByHub: Record<string, number>;
  pingByHub: Record<string, number | null>;
  hubNotifyMode: Record<string, NotifyMode>;
  /** Hubs whose session is confined to the lobby (lobby-bot-survey.md
   * Feature 1) — rendered with a small persistent badge that disappears
   * once the background PoW promotes the session, even for hubs the user
   * has navigated away from. */
  lobbyHubIds: Set<string>;
  hasActiveHub: boolean;
  isFarmAdmin: boolean;
  onSwitchToDms: () => void;
  onSwitchHub: (hubId: string) => void;
  onRemoveHub: (hubId: string) => void;
  onHubReorder: (event: DragEndEvent) => void;
  onAddHub: () => void;
  onCreateHub: () => void;
  onDiscover: () => void;
  onFarmSettings: () => void;
}

export function HubSidebar({
  hubs, activeHubId, view, showDiscover, unreadDms, unreadByHub, pingByHub,
  hubNotifyMode, lobbyHubIds, hasActiveHub, isFarmAdmin,
  onSwitchToDms, onSwitchHub, onRemoveHub,
  onHubReorder, onAddHub, onCreateHub, onDiscover, onFarmSettings,
}: Props) {
  const { t } = useTranslation();
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fixed-position popover (matches the channel-list context-menu pattern):
  // .hub-sidebar clips overflow-x, so a plain position:absolute popover
  // anchored inside it gets silently clipped and never paints.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuPos, setAddMenuPos] = useState<{ x: number; y: number } | null>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const hubButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function toggleAddMenu() {
    if (addMenuOpen) { setAddMenuOpen(false); return; }
    const rect = plusButtonRef.current?.getBoundingClientRect();
    if (rect) setAddMenuPos({ x: rect.right + 8, y: rect.top });
    setAddMenuOpen(true);
  }

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

  return (
    <nav className="hub-sidebar" aria-label="Hubs">
      <div className="hub-icon-box">
        <button
          className={`hub-icon dm ${view === "dms" ? "active" : ""}`}
          onClick={onSwitchToDms}
          disabled={!hasActiveHub}
          title="Direct Messages"
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
          <div role="tablist" aria-label="Hub list" aria-orientation="vertical">
            {hubs.map((h, index) => {
              const unread = unreadByHub[h.hub_id] || 0;
              const ping = pingByHub[h.hub_id];
              const offline = ping === null;
              const titleSuffix = offline ? " — offline" : ping === undefined ? "" : ` — ${ping}ms`;
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
                      onContextMenu={(e) => { e.preventDefault(); onRemoveHub(h.hub_id); }}
                      title={`${h.hub_name} (${h.hub_url})${titleSuffix}${
                        hubNotifyMode[h.hub_id] === "silent"
                          ? " — silenced"
                          : hubNotifyMode[h.hub_id] === "mentions"
                          ? " — mentions only"
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
                    {lobbyHubIds.has(h.hub_id) && (
                      <span className="hub-muted-badge" title={t("lobby.sidebar_hint")}>🕒</span>
                    )}
                    {hubNotifyMode[h.hub_id] === "silent" && (
                      <span className="hub-muted-badge" title="Silenced" aria-hidden="true">🔕</span>
                    )}
                    {hubNotifyMode[h.hub_id] === "mentions" && (
                      <span className="hub-muted-badge" title="Mentions only" aria-hidden="true">@</span>
                    )}
                  </div>
                  {offline && <span className="hub-offline-label" aria-hidden="true">offline</span>}
                </SortableHubIcon>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <button
        ref={plusButtonRef}
        className="hub-icon add"
        onClick={toggleAddMenu}
        title={t("hub.add_or_create")}
      >
        +
      </button>
      {addMenuOpen && addMenuPos && (
        <div
          className="context-menu-overlay"
          onClick={() => setAddMenuOpen(false)}
          onContextMenu={(e) => { e.preventDefault(); setAddMenuOpen(false); }}
        >
          <div
            className="context-menu"
            style={{ top: addMenuPos.y, left: addMenuPos.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="context-menu-item" onClick={() => { setAddMenuOpen(false); onAddHub(); }}>
              {t("hub.join")}
            </button>
            <button className="context-menu-item" onClick={() => { setAddMenuOpen(false); onCreateHub(); }}>
              {t("hub.create")}
            </button>
          </div>
        </div>
      )}

      <div className="hub-sidebar-divider" />
      <button
        className={`hub-icon discover ${showDiscover ? "active" : ""}`}
        onClick={onDiscover}
        title="Discover hubs"
      >
        ⊕
      </button>
      {isFarmAdmin && (
        <button
          className="hub-icon"
          onClick={onFarmSettings}
          title="Farm settings"
          style={{ fontSize: 14 }}
        >
          ⚙
        </button>
      )}
    </nav>
  );
}
