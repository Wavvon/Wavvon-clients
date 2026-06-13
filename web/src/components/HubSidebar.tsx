import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Hub, NotifyMode } from "../types";
import { SortableHubIcon } from "./SortableItems";

interface Props {
  hubs: Hub[];
  activeHubId: string | null;
  view: "channels" | "dms";
  showDiscover: boolean;
  unreadDms: Record<string, boolean>;
  unreadByHub: Record<string, number>;
  pingByHub: Record<string, number | null>;
  hubNotifyMode: Record<string, NotifyMode>;
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
  hubNotifyMode, hasActiveHub, isFarmAdmin,
  onSwitchToDms, onSwitchHub, onRemoveHub,
  onHubReorder, onAddHub, onCreateHub, onDiscover, onFarmSettings,
}: Props) {
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const hubButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!addMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [addMenuOpen]);

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

      <div ref={addMenuRef} style={{ position: "relative" }}>
        <button
          className="hub-icon add"
          onClick={() => setAddMenuOpen((v) => !v)}
          title="Add or create hub"
        >
          +
        </button>
        {addMenuOpen && (
          <div
            style={{
              position: "absolute",
              left: "calc(100% + 8px)",
              top: 0,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              padding: "4px 0",
              minWidth: 160,
              zIndex: 200,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            <button
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text)",
              }}
              onClick={() => { setAddMenuOpen(false); onAddHub(); }}
            >
              Join a hub
            </button>
            <button
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text)",
              }}
              onClick={() => { setAddMenuOpen(false); onCreateHub(); }}
            >
              Create a hub
            </button>
          </div>
        )}
      </div>

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
