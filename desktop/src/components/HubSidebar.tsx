import React, { useState, useRef, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="hub-sidebar">
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
          <span className="hub-unread-badge">
            {Object.keys(unreadDms).length > 99 ? "99+" : Object.keys(unreadDms).length}
          </span>
        )}
      </div>
      <div className="hub-sidebar-divider" />
      <DndContext sensors={dndSensors} onDragEnd={onHubReorder}>
        <SortableContext items={hubs.map((h) => h.hub_id)} strategy={verticalListSortingStrategy}>
          {hubs.map((h) => {
            const unread = unreadByHub[h.hub_id] || 0;
            const ping = pingByHub[h.hub_id];
            const offline = ping === null;
            const titleSuffix = offline ? " — offline" : ping === undefined ? "" : ` — ${ping}ms`;
            return (
              <SortableHubIcon key={h.hub_id} hubId={h.hub_id}>
                <div className="hub-icon-box">
                  <button
                    className={`hub-icon ${
                      h.hub_id === activeHubId && view === "channels" ? "active" : ""
                    } ${offline ? "offline" : ""} ${
                      hubNotifyMode[h.hub_id] === "silent" ? "muted" : ""
                    }`}
                    onClick={() => { onSwitchHub(h.hub_id); }}
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
                    <span className="hub-unread-badge">{unread > 99 ? "99+" : unread}</span>
                  )}
                  {hubNotifyMode[h.hub_id] === "silent" && (
                    <span className="hub-muted-badge" title="Silenced">🔕</span>
                  )}
                  {hubNotifyMode[h.hub_id] === "mentions" && (
                    <span className="hub-muted-badge" title="Mentions only">@</span>
                  )}
                </div>
                {offline && <span className="hub-offline-label">offline</span>}
              </SortableHubIcon>
            );
          })}
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
    </div>
  );
}
