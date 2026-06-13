import React from "react";
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
  onSwitchToDms: () => void;
  onSwitchHub: (hubId: string) => void;
  onRemoveHub: (hubId: string) => void;
  onHubReorder: (event: DragEndEvent) => void;
  onAddHub: () => void;
  onDiscover: () => void;
}

export function HubSidebar({
  hubs, activeHubId, view, showDiscover, unreadDms, unreadByHub, pingByHub,
  hubNotifyMode, hasActiveHub, onSwitchToDms, onSwitchHub, onRemoveHub,
  onHubReorder, onAddHub, onDiscover,
}: Props) {
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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
      <button className="hub-icon add" onClick={onAddHub} title="Add hub">+</button>
      <div className="hub-sidebar-divider" />
      <button
        className={`hub-icon discover ${showDiscover ? "active" : ""}`}
        onClick={onDiscover}
        title="Discover hubs"
      >
        ⊕
      </button>
    </div>
  );
}
