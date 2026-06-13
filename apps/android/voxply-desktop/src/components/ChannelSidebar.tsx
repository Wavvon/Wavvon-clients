import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type {
  Channel,
  Hub,
  NotifyMode,
  VoiceParticipant,
  User,
  AllianceInfo,
  AllianceSharedChannel,
  Conversation,
} from "../types";
import type { TreeNode, FlatNode } from "@voxply/core";
import { PhoneOffIcon, ChannelIcon, PingIcon } from "./Icons";
import { SortableCategoryItem, SortableChannelItem } from "./SortableItems";
import { HoverSubmenu } from "@voxply/ui";

const CHANNEL_INDENT_PX = 16;

interface SelectedAllianceChannel {
  alliance_id: string;
  alliance_name: string;
  channel: AllianceSharedChannel;
}

interface Props {
  view: "channels" | "dms";
  activeHubId: string | null;
  hubs: Hub[];
  channels: Channel[];
  selectedChannel: Channel | null;
  unreadByChannel: Record<string, Record<string, boolean>>;
  collapsedCategories: Record<string, Record<string, boolean>>;
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  voiceChannelId: string | null;
  selfMuted: boolean;
  selfDeafened: boolean;
  users: User[];
  publicKey: string | null;
  pingByHub: Record<string, number | null>;
  isAdmin: boolean;
  hubNotifyMode: Record<string, NotifyMode>;
  hubDropdownOpen: boolean;
  hideSilenced: boolean;
  silencedChannelIds: Set<string>;
  userAlliances: AllianceInfo[];
  allianceChannels: Record<string, AllianceSharedChannel[]>;
  selectedAllianceChannel: SelectedAllianceChannel | null;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  unreadDms: Record<string, boolean>;
  channelTree: TreeNode[];
  effectiveNotifyMode: (hubId: string, channelId: string) => NotifyMode;
  onToggleCategoryCollapsed: (hubId: string, categoryId: string) => void;
  onHubDropdownOpenChange: (v: boolean) => void;
  onSetHubMode: (hubId: string, mode: NotifyMode) => void;
  onClearHubUnread: (hubId: string) => void;
  onRemoveHub: (hubId: string) => void;
  onOpenHubAdmin: () => void;
  onOpenHubAdminInvites: () => void;
  onOpenCreateChannel: (parentId: string | null, isCategory: boolean) => void;
  onSelectChannel: (channel: Channel) => void;
  onChannelContextMenu: (e: React.MouseEvent, channel: Channel) => void;
  onOpenChannelSettings: (channel: Channel) => void;
  onVoiceJoin: (channel?: Channel) => void;
  onVoiceLeave: () => void;
  onSelectAllianceChannel: (alliance: AllianceInfo, channel: AllianceSharedChannel) => void;
  onSelectConversation: (conv: Conversation) => void;
  onOpenFriends: () => void;
  onToggleSelfMute: () => void;
  onToggleSelfDeafen: () => void;
  onOpenSettings: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onToggleHideSilenced: () => void;
  dndEnabled: boolean;
  onToggleDnd: () => void;
}

export function ChannelSidebar({
  view, activeHubId, hubs, channels, selectedChannel,
  unreadByChannel, collapsedCategories,
  voicePartByChannel, voiceChannelId, selfMuted, selfDeafened,
  users, publicKey, pingByHub, isAdmin, hubNotifyMode, hubDropdownOpen,
  hideSilenced, silencedChannelIds,
  userAlliances, allianceChannels, selectedAllianceChannel,
  conversations, selectedConversation, unreadDms,
  channelTree, effectiveNotifyMode, onToggleCategoryCollapsed,
  onHubDropdownOpenChange, onSetHubMode, onClearHubUnread, onRemoveHub,
  onOpenHubAdmin, onOpenHubAdminInvites, onOpenCreateChannel,
  onSelectChannel, onChannelContextMenu, onOpenChannelSettings,
  onVoiceJoin, onVoiceLeave,
  onSelectAllianceChannel, onSelectConversation,
  onOpenFriends, onToggleSelfMute, onToggleSelfDeafen, onOpenSettings,
  onDragEnd, onToggleHideSilenced, dndEnabled, onToggleDnd,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [hubCtxMenu, setHubCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const hubHeaderRef = useRef<HTMLDivElement>(null);
  const [channelFocusIndex, setChannelFocusIndex] = useState(0);
  const channelItemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!hubDropdownOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (hubHeaderRef.current && !hubHeaderRef.current.contains(e.target as Node)) {
        onHubDropdownOpenChange(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [hubDropdownOpen, onHubDropdownOpenChange]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const flatVisible = useMemo((): FlatNode[] => {
    const result: FlatNode[] = [];
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        result.push({
          node: n.node,
          depth: n.depth,
          parentId: n.node.parent_id,
          childrenCount: n.children.length,
        });
        const collapsed = !!(activeHubId && collapsedCategories[activeHubId]?.[n.node.id]);
        if (!collapsed) walk(n.children);
      }
    }
    walk(channelTree);
    return result.filter((n) => n.node.is_category || !silencedChannelIds.has(n.node.id));
  }, [channelTree, activeHubId, collapsedCategories, silencedChannelIds]);

  const activeNode = activeId ? flatVisible.find((n) => n.node.id === activeId) : null;

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);
  const myDisplayName = users.find((u) => u.public_key === publicKey)?.display_name;
  const activePing = activeHubId ? pingByHub[activeHubId] : undefined;
  const voiceChannelName = channels.find((c) => c.id === voiceChannelId)?.name;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setDragOverId(null);
  }

  function handleDragEndWrapped(event: DragEndEvent) {
    setActiveId(null);
    setDragOverId(null);
    onDragEnd(event);
  }

  function handleDragOver(e: DragOverEvent) {
    const overId = e.over ? String(e.over.id) : null;
    const overNode = overId ? flatVisible.find(n => n.node.id === overId) : null;
    setDragOverId(overNode?.node.is_category ? overId : null);
  }

  const handleChannelKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const node = flatVisible[index];
    if (!node) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(index + 1, flatVisible.length - 1);
      setChannelFocusIndex(next);
      channelItemRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(index - 1, 0);
      setChannelFocusIndex(prev);
      channelItemRefs.current[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setChannelFocusIndex(0);
      channelItemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = flatVisible.length - 1;
      setChannelFocusIndex(last);
      channelItemRefs.current[last]?.focus();
    } else if (e.key === "ArrowLeft" && node.node.is_category && activeHubId) {
      e.preventDefault();
      if (!collapsedCategories[activeHubId]?.[node.node.id]) {
        onToggleCategoryCollapsed(activeHubId, node.node.id);
      }
    } else if (e.key === "ArrowRight" && node.node.is_category && activeHubId) {
      e.preventDefault();
      if (collapsedCategories[activeHubId]?.[node.node.id]) {
        onToggleCategoryCollapsed(activeHubId, node.node.id);
      }
    } else if ((e.key === "Enter" || e.key === " ") && !node.node.is_category) {
      e.preventDefault();
      onSelectChannel(node.node);
    }
  }, [flatVisible, activeHubId, collapsedCategories, onToggleCategoryCollapsed, onSelectChannel]);

  return (
    <nav className="sidebar" aria-label="Channels">
      {view === "channels" && (
        <div className="hub-header" ref={hubHeaderRef}>
          <button
            className="hub-header-button"
            onClick={() => onHubDropdownOpenChange(!hubDropdownOpen)}
          >
            <span className="hub-header-name">{activeHub?.hub_name ?? "Hub"}</span>
            <span className="hub-header-chevron">{hubDropdownOpen ? "▴" : "▾"}</span>
          </button>
          {hubDropdownOpen && (
            <div className="hub-dropdown">
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={onOpenHubAdminInvites}>
                  Invite people
                </button>
              )}
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={onOpenHubAdmin}>
                  Hub settings
                </button>
              )}
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={() => { onHubDropdownOpenChange(false); onOpenCreateChannel(null, false); }}>
                  Create…
                </button>
              )}
              <HoverSubmenu
                trigger={<button className="hub-dropdown-item hub-dropdown-submenu-trigger">Notifications ▸</button>}
              >
                {activeHubId && (() => {
                  const cur = hubNotifyMode[activeHubId] ?? "all";
                  return ([
                    { mode: "all" as NotifyMode, label: "All messages" },
                    { mode: "mentions" as NotifyMode, label: "@mentions only" },
                    { mode: "silent" as NotifyMode, label: "Silence" },
                  ]).map(({ mode, label }) => (
                    <button key={mode} className="hub-dropdown-item hub-dropdown-subitem"
                      onClick={() => { onHubDropdownOpenChange(false); onSetHubMode(activeHubId, mode); }}>
                      {cur === mode ? "✓ " : "   "}{label}
                    </button>
                  ));
                })()}
              </HoverSubmenu>
              <button
                className="hub-dropdown-item"
                onClick={() => { onHubDropdownOpenChange(false); onToggleHideSilenced(); }}
              >
                {hideSilenced ? "✓ " : ""}Hide silenced channels
              </button>
              {activeHubId && Object.keys(unreadByChannel[activeHubId] ?? {}).length > 0 && (
                <button
                  className="hub-dropdown-item"
                  onClick={() => {
                    onHubDropdownOpenChange(false);
                    onClearHubUnread(activeHubId);
                  }}
                >
                  Mark all as read
                </button>
              )}
              <button
                className="hub-dropdown-item danger"
                onClick={() => {
                  onHubDropdownOpenChange(false);
                  if (activeHubId) onRemoveHub(activeHubId);
                }}
              >
                Leave hub
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className="sidebar-scroll"
        onContextMenu={view === "channels" ? (e) => {
          e.preventDefault();
          setHubCtxMenu({ x: e.clientX, y: e.clientY });
        } : undefined}
      >
        {view !== "dms" ? (
          <>
            <DndContext
              sensors={dndSensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEndWrapped}
              onDragOver={handleDragOver}
            >
              <SortableContext
                items={flatVisible.map((n) => n.node.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="channel-list">
                  {flatVisible.map((n, idx) =>
                    n.node.is_category ? (
                      <SortableCategoryItem
                        key={n.node.id}
                        channel={n.node}
                        collapsed={!!activeHubId && !!collapsedCategories[activeHubId]?.[n.node.id]}
                        childCount={n.childrenCount}
                        style={{ paddingLeft: n.depth * CHANNEL_INDENT_PX }}
                        isDragTarget={dragOverId === n.node.id}
                        tabIndex={channelFocusIndex === idx ? 0 : -1}
                        onToggleCollapsed={() => {
                          if (activeHubId) onToggleCategoryCollapsed(activeHubId, n.node.id);
                        }}
                        onContextMenu={(e) => { e.stopPropagation(); onChannelContextMenu(e, n.node); }}
                        onKeyDown={(e) => handleChannelKeyDown(e, idx)}
                        onAdd={() => onOpenCreateChannel(n.node.id, false)}
                        onSettings={isAdmin ? (_e) => onOpenChannelSettings(n.node) : undefined}
                      />
                    ) : (
                      <SortableChannelItem
                        key={n.node.id}
                        channel={n.node}
                        selected={selectedChannel?.id === n.node.id}
                        unread={!!activeHubId && !!unreadByChannel[activeHubId]?.[n.node.id]}
                        muted={!!activeHubId && effectiveNotifyMode(activeHubId, n.node.id) === "silent"}
                        participants={voicePartByChannel[n.node.id] ?? []}
                        isCurrentVoiceChannel={voiceChannelId === n.node.id}
                        style={{ paddingLeft: n.depth * CHANNEL_INDENT_PX }}
                        tabIndex={channelFocusIndex === idx ? 0 : -1}
                        onClick={() => { setChannelFocusIndex(idx); onSelectChannel(n.node); }}
                        onDoubleClick={() => { if (voiceChannelId !== n.node.id) onVoiceJoin(n.node); }}
                        onContextMenu={(e) => { e.stopPropagation(); onChannelContextMenu(e, n.node); }}
                        onKeyDown={(e) => handleChannelKeyDown(e, idx)}
                        onSettings={isAdmin ? (_e) => onOpenChannelSettings(n.node) : undefined}
                      />
                    )
                  )}
                </ul>
              </SortableContext>
              <DragOverlay>
                {activeNode && (
                  <div
                    className={`channel-drag-ghost ${activeNode.node.is_category ? "is-category" : ""}`}
                    style={{ paddingLeft: activeNode.depth * CHANNEL_INDENT_PX }}
                  >
                    {activeNode.node.is_category
                      ? `▾ ${activeNode.node.name.toUpperCase()}`
                      : <><ChannelIcon icon={activeNode.node.icon} customIconSvg={activeNode.node.custom_icon_svg} />{" "}{activeNode.node.name}</>}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
            {channels.length === 0 && <p className="muted">No channels yet</p>}

            {userAlliances.length > 0 && (
              <div className="sidebar-alliances">
                {userAlliances.map((a) => {
                  const allChans = allianceChannels[a.id] ?? [];
                  const remoteOnly = allChans.filter(
                    (c) => !channels.find((local) => local.id === c.channel_id)
                  );
                  if (remoteOnly.length === 0) return null;
                  return (
                    <div key={a.id} className="sidebar-alliance-group">
                      <div className="sidebar-header sidebar-header-alliance">
                        <h3>🤝 {a.name}</h3>
                      </div>
                      <ul className="channel-list">
                        {remoteOnly.map((c) => {
                          const isSelected =
                            selectedAllianceChannel?.alliance_id === a.id &&
                            selectedAllianceChannel.channel.channel_id === c.channel_id;
                          return (
                            <li
                              key={c.channel_id}
                              className={`channel-item ${isSelected ? "selected" : ""}`}
                              onClick={() => onSelectAllianceChannel(a, c)}
                              title={`Hosted on ${c.hub_name}`}
                            >
                              # {c.channel_name}
                              <span className="alliance-channel-host">{c.hub_name}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}


          </>
        ) : (
          <>
            <div className="sidebar-header">
              <h3>Direct Messages</h3>
              <button className="btn-icon" onClick={onOpenFriends} title="Friends">
                👥
              </button>
            </div>
            <ul className="channel-list">
              {[...conversations]
                .sort((a, b) => (b.last_activity_at ?? b.created_at) - (a.last_activity_at ?? a.created_at))
                .map((c) => {
                  const others = c.members.filter((m) => m !== publicKey);
                  const label = others
                    .map((k) => {
                      const u = users.find((u) => u.public_key === k);
                      return u?.display_name || k.slice(0, 12);
                    })
                    .join(", ");
                  const unread = !!unreadDms[c.id];
                  return (
                    <li
                      key={c.id}
                      className={`channel-item ${selectedConversation?.id === c.id ? "selected" : ""} ${unread ? "unread" : ""}`}
                      onClick={() => onSelectConversation(c)}
                    >
                      {unread && <span className="channel-unread-dot" />}
                      @ {label || "(empty)"}
                    </li>
                  );
                })}
            </ul>
            {conversations.length === 0 && (
              <p className="muted">No conversations. Start one from your friends list.</p>
            )}
          </>
        )}
      </div>

      {view === "channels" && hubCtxMenu && (
        <div
          className="context-menu-overlay"
          onClick={() => setHubCtxMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setHubCtxMenu(null); }}
        >
          <div
            className="context-menu"
            style={{ top: hubCtxMenu.y, left: hubCtxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); onOpenCreateChannel(null, false); }}>
                Create…
              </button>
            )}
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); onOpenHubAdminInvites(); }}>
                Invite people
              </button>
            )}
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); onOpenHubAdmin(); }}>
                Hub settings
              </button>
            )}
            <button
              className="context-menu-item"
              onClick={() => { setHubCtxMenu(null); onToggleHideSilenced(); }}
            >
              {hideSilenced ? "✓ " : ""}Hide silenced channels
            </button>
            <HoverSubmenu
              trigger={<button className="context-menu-item context-menu-submenu-trigger">Notifications ▸</button>}
            >
              {activeHubId && (() => {
                const cur = hubNotifyMode[activeHubId] ?? "all";
                return ([
                  { mode: "all" as NotifyMode, label: "All messages" },
                  { mode: "mentions" as NotifyMode, label: "@mentions only" },
                  { mode: "silent" as NotifyMode, label: "Silence" },
                ]).map(({ mode, label }) => (
                  <button key={mode} className="context-menu-item context-menu-subitem"
                    onClick={() => { setHubCtxMenu(null); onSetHubMode(activeHubId, mode); }}>
                    {cur === mode ? "✓ " : "   "}{label}
                  </button>
                ));
              })()}
            </HoverSubmenu>
            {activeHubId && Object.keys(unreadByChannel[activeHubId] ?? {}).length > 0 && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); if (activeHubId) onClearHubUnread(activeHubId); }}>
                Mark all as read
              </button>
            )}
            <button className="context-menu-item danger" onClick={() => { setHubCtxMenu(null); if (activeHubId) onRemoveHub(activeHubId); }}>
              Leave hub
            </button>
          </div>
        </div>
      )}

      <div className="user-info">
        {voiceChannelId && (
          <>
            <div className="voice-status-bar">
              <span className="status-dot online" />
              <span className="voice-status-label">#{voiceChannelName}</span>
              {activePing !== undefined && <PingIcon ping={activePing} />}
            </div>

            <div className="user-actions">
              <div className="user-actions-icons">
                <button
                  onClick={onToggleSelfMute}
                  className={`btn-icon-gear ${selfMuted ? "active" : ""}`}
                  title={selfMuted ? "Unmute mic" : "Mute mic"}
                >
                  {selfMuted ? "🚫🎙️" : "🎙️"}
                </button>
                <button
                  onClick={onToggleSelfDeafen}
                  className={`btn-icon-gear ${selfDeafened ? "active" : ""}`}
                  title={selfDeafened ? "Undeafen" : "Deafen"}
                >
                  {selfDeafened ? "🚫🔊" : "🔊"}
                </button>
                <button
                  onClick={onToggleDnd}
                  className={`btn-icon-gear ${dndEnabled ? "active" : ""}`}
                  title={dndEnabled ? "DND on — tap to disable" : "Do not disturb"}
                  aria-label={dndEnabled ? "Disable do not disturb" : "Enable do not disturb"}
                >
                  {dndEnabled ? "🔕" : "🔔"}
                </button>
                <button
                  onClick={onVoiceLeave}
                  className="btn-icon-gear voice-call-btn end"
                  title="Leave voice"
                  aria-label="Leave voice"
                >
                  <PhoneOffIcon />
                </button>
              </div>
            </div>
          </>
        )}

        <div className="user-identity">
          <div className="user-identity-avatar" />
          <div className="user-identity-details">
            <span className="user-identity-name" title={publicKey ?? undefined}>
              {myDisplayName || publicKey?.slice(0, 12) || "You"}
            </span>
          </div>
          <button onClick={onOpenSettings} className="btn-icon-gear" title="Settings">
            ⚙
          </button>
        </div>
      </div>
    </nav>
  );
}
