import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { WhisperPanel } from "./WhisperPanel";
import type { WhisperTarget, WhisperList } from "../hooks/useWhisper";
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
import { useTranslation } from "react-i18next";
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
import type { TreeNode, FlatNode } from "@wavvon/core";
import { PhoneOffIcon, ChannelIcon, PingIcon, SortableCategoryItem, SortableChannelItem, HoverSubmenu, SearchBar } from "@wavvon/ui";
import type { GlobalSearchResult } from "@wavvon/ui";
import { hasDraft } from "../utils/drafts";

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
  onOpenCreateChannel: (parentId: string | null) => void;
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
  sharing: boolean;
  onScreenShare: () => void;
  hubStreamsCount: number;
  onToggleHubStreams: () => void;
  /** Own presence: null/undefined = online, "away", "dnd". */
  myStatus?: string | null;
  /** Own custom status text shown under the display name. */
  myStatusCustom?: string | null;
  onSetStatus?: (status: "online" | "away" | "dnd", custom: string | null) => void;
  voiceGains: Record<string, number>;
  onSetVoiceGain: (publicKey: string, gainPct: number) => void;
  inboundWhispers: Set<string>;
  isWhispering: boolean;
  whisperTargets: WhisperTarget[];
  whisperLists: WhisperList[];
  showWhisperPanel: boolean;
  onToggleWhisperPanel: () => void;
  onCloseWhisperPanel: () => void;
  onStartWhisper: (targets: WhisperTarget[]) => void;
  onStopWhisper: () => void;
  onSaveWhisperList: (list: WhisperList) => void;
  onDeleteWhisperList: (id: string) => void;
  videoEnabled: boolean;
  onVideoToggle: (deviceId?: string) => void;
  onCameraDeviceChange: (deviceId: string) => void;
  onGlobalSearchNavigate: (channelId: string, messageId: string) => void;
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
  onDragEnd, onToggleHideSilenced, sharing, onScreenShare, hubStreamsCount, onToggleHubStreams,
  myStatus, myStatusCustom, onSetStatus,
  voiceGains, onSetVoiceGain,
  inboundWhispers, isWhispering, whisperTargets, whisperLists,
  showWhisperPanel, onToggleWhisperPanel, onCloseWhisperPanel,
  onStartWhisper, onStopWhisper, onSaveWhisperList, onDeleteWhisperList,
  videoEnabled, onVideoToggle, onCameraDeviceChange,
  onGlobalSearchNavigate,
}: Props) {
  const { t } = useTranslation();
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [hubCtxMenu, setHubCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const hubHeaderRef = useRef<HTMLDivElement>(null);
  const [channelFocusIndex, setChannelFocusIndex] = useState(0);
  const channelItemRefs = useRef<(HTMLElement | null)[]>([]);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [statusCustomDraft, setStatusCustomDraft] = useState(myStatusCustom ?? "");
  const statusMenuRef = useRef<HTMLDivElement>(null);
  // Re-seed the draft each time the picker opens so it reflects the current text.
  useEffect(() => {
    if (showStatusMenu) setStatusCustomDraft(myStatusCustom ?? "");
  }, [showStatusMenu, myStatusCustom]);
  // Dismiss the status picker on any click outside it.
  useEffect(() => {
    if (!showStatusMenu) return;
    const onDown = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showStatusMenu]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const whisperBtnRef = useRef<HTMLButtonElement>(null);
  const [whisperPanelPos, setWhisperPanelPos] = useState<{ bottom: number; left: number } | null>(null);
  const [moreVoiceOpen, setMoreVoiceOpen] = useState(false);
  const moreVoiceRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!showWhisperPanel || !whisperBtnRef.current) return;
    const rect = whisperBtnRef.current.getBoundingClientRect();
    setWhisperPanelPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
  }, [showWhisperPanel]);

  useEffect(() => {
    if (!moreVoiceOpen) return;
    function onOutside(e: MouseEvent) {
      if (moreVoiceRef.current && !moreVoiceRef.current.contains(e.target as Node)) {
        setMoreVoiceOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [moreVoiceOpen]);

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
    } else if ((e.key === "Enter" || e.key === " ") && !node.node.is_category && node.node.channel_type !== "banner") {
      e.preventDefault();
      onSelectChannel(node.node);
    }
  }, [flatVisible, activeHubId, collapsedCategories, onToggleCategoryCollapsed, onSelectChannel]);

  const notifyModeLabels: Record<NotifyMode, string> = {
    all: t("hub.notifications.all"),
    mentions: t("hub.notifications.mentions"),
    silent: t("hub.notifications.silent"),
  };

  return (
    <nav className="sidebar" aria-label={t("channel.sidebar.label")}>
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
                  {t("hub.invite_people")}
                </button>
              )}
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={onOpenHubAdmin}>
                  {t("hub.settings")}
                </button>
              )}
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={() => { onHubDropdownOpenChange(false); onOpenCreateChannel(null); }}>
                  {t("hub.create_channel")}
                </button>
              )}
              <HoverSubmenu
                trigger={<button className="hub-dropdown-item hub-dropdown-submenu-trigger">{t("hub.notifications")} ▸</button>}
              >
                {activeHubId && (() => {
                  const cur = hubNotifyMode[activeHubId] ?? "all";
                  return (["all", "mentions", "silent"] as NotifyMode[]).map((mode) => (
                    <button key={mode} className="hub-dropdown-item hub-dropdown-subitem"
                      onClick={() => { onHubDropdownOpenChange(false); onSetHubMode(activeHubId, mode); }}>
                      {cur === mode ? "✓ " : "   "}{notifyModeLabels[mode]}
                    </button>
                  ));
                })()}
              </HoverSubmenu>
              <button
                className="hub-dropdown-item"
                onClick={() => { onHubDropdownOpenChange(false); onToggleHideSilenced(); }}
              >
                {hideSilenced ? "✓ " : ""}{t("hub.hide_silenced")}
              </button>
              {activeHubId && Object.keys(unreadByChannel[activeHubId] ?? {}).length > 0 && (
                <button
                  className="hub-dropdown-item"
                  onClick={() => {
                    onHubDropdownOpenChange(false);
                    onClearHubUnread(activeHubId);
                  }}
                >
                  {t("hub.mark_all_read")}
                </button>
              )}
              <button
                className="hub-dropdown-item danger"
                onClick={() => {
                  onHubDropdownOpenChange(false);
                  if (activeHubId) onRemoveHub(activeHubId);
                }}
              >
                {t("hub.leave")}
              </button>
            </div>
          )}
        </div>
      )}

      {view === "channels" && (
        <button
          className="btn-ghost"
          style={{ width: "100%", textAlign: "left", padding: "6px 12px" }}
          onClick={() => setSearchBarOpen(true)}
        >
          🔍 {t("search.placeholder")}
        </button>
      )}

      {searchBarOpen && (
        <SearchBar
          onSearch={(q) => invoke<GlobalSearchResult[]>("search_messages_global", { q })}
          onClose={() => setSearchBarOpen(false)}
          onNavigate={(channelId, messageId) => {
            onGlobalSearchNavigate(channelId, messageId);
            setSearchBarOpen(false);
          }}
        />
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
                        onAdd={() => onOpenCreateChannel(n.node.id)}
                        onSettings={isAdmin ? (_e) => onOpenChannelSettings(n.node) : undefined}
                      />
                    ) : (
                      <SortableChannelItem
                        key={n.node.id}
                        channel={n.node}
                        activeHubId={activeHubId}
                        selected={selectedChannel?.id === n.node.id}
                        unread={!!activeHubId && !!unreadByChannel[activeHubId]?.[n.node.id]}
                        unreadCount={activeHubId ? Object.keys(unreadByChannel[activeHubId] ?? {}).filter(id => id === n.node.id).length : 0}
                        muted={!!activeHubId && effectiveNotifyMode(activeHubId, n.node.id) === "silent"}
                        participants={voicePartByChannel[n.node.id] ?? []}
                        isCurrentVoiceChannel={voiceChannelId === n.node.id}
                        hubUrl={activeHub?.hub_url}
                        style={{ paddingLeft: n.depth * CHANNEL_INDENT_PX }}
                        tabIndex={channelFocusIndex === idx ? 0 : -1}
                        voiceGains={voiceGains}
                        inboundWhispers={inboundWhispers}
                        hasDraft={hasDraft}
                        onClick={() => { setChannelFocusIndex(idx); onSelectChannel(n.node); }}
                        onDoubleClick={() => { if (voiceChannelId !== n.node.id) onVoiceJoin(n.node); }}
                        onContextMenu={(e) => { e.stopPropagation(); onChannelContextMenu(e, n.node); }}
                        onKeyDown={(e) => handleChannelKeyDown(e, idx)}
                        onSettings={isAdmin ? (_e) => onOpenChannelSettings(n.node) : undefined}
                        onSetVoiceGain={onSetVoiceGain}
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
            {channels.length === 0 && <p className="muted">{t("channel.no_channels")}</p>}

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
              <h3>{t("dm.header.title")}</h3>
              <button className="btn-icon" onClick={onOpenFriends} title={t("friends.title")}>
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
              <p className="muted">{t("dm.no_conversations")}</p>
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
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); onOpenCreateChannel(null); }}>
                {t("hub.create_channel")}
              </button>
            )}
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); onOpenHubAdminInvites(); }}>
                {t("hub.invite_people")}
              </button>
            )}
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); onOpenHubAdmin(); }}>
                {t("hub.settings")}
              </button>
            )}
            <button
              className="context-menu-item"
              onClick={() => { setHubCtxMenu(null); onToggleHideSilenced(); }}
            >
              {hideSilenced ? "✓ " : ""}{t("hub.hide_silenced")}
            </button>
            <HoverSubmenu
              trigger={<button className="context-menu-item context-menu-submenu-trigger">{t("hub.notifications")} ▸</button>}
            >
              {activeHubId && (() => {
                const cur = hubNotifyMode[activeHubId] ?? "all";
                return (["all", "mentions", "silent"] as NotifyMode[]).map((mode) => (
                  <button key={mode} className="context-menu-item context-menu-subitem"
                    onClick={() => { setHubCtxMenu(null); onSetHubMode(activeHubId, mode); }}>
                    {cur === mode ? "✓ " : "   "}{notifyModeLabels[mode]}
                  </button>
                ));
              })()}
            </HoverSubmenu>
            {activeHubId && Object.keys(unreadByChannel[activeHubId] ?? {}).length > 0 && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); if (activeHubId) onClearHubUnread(activeHubId); }}>
                {t("hub.mark_all_read")}
              </button>
            )}
            <button className="context-menu-item danger" onClick={() => { setHubCtxMenu(null); if (activeHubId) onRemoveHub(activeHubId); }}>
              {t("hub.leave")}
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
                {/* Primary voice controls */}
                <button
                  onClick={onToggleSelfMute}
                  className={`btn-icon-gear ${selfMuted ? "active" : ""}`}
                  aria-pressed={selfMuted}
                  aria-label={selfMuted ? t("voice.unmute") : t("voice.mute")}
                  title={selfMuted ? t("voice.unmute.short") : t("voice.mute.short")}
                >
                  {selfMuted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 2l20 20-1.4 1.4-3.07-3.07A8 8 0 0 1 4.07 11H6a6 6 0 0 0 8.93 5.52l-1.56-1.56A4 4 0 0 1 8 12V9.41L3.4 4.82 2 3.41 3.41 2zM13 5.17V6a4 4 0 0 1 .83 7.9L12 12.07V6a1.98 1.98 0 0 0-2.92-1.75L7.64 2.82A4 4 0 0 1 13 5.17zm-1 13.76V22h-2v-3.07A8 8 0 0 1 5.08 13h1.95A6 6 0 0 0 12 18.93z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4zm-1 16.93A8 8 0 0 1 4.07 11H6a6 6 0 0 0 12 0h1.93A8 8 0 0 1 13 18.93V22h-2v-3.07z"/></svg>
                  )}
                </button>
                <button
                  onClick={onToggleSelfDeafen}
                  className={`btn-icon-gear ${selfDeafened ? "active" : ""}`}
                  aria-pressed={selfDeafened}
                  aria-label={selfDeafened ? t("voice.undeafen") : t("voice.deafen")}
                  title={selfDeafened ? t("voice.undeafen") : t("voice.deafen")}
                >
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
                    style={selfDeafened ? { opacity: 0.4 } : undefined}
                  >
                    <path d="M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2a7 7 0 0 1 14 0v2h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9z"/>
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (videoEnabled) {
                      onVideoToggle();
                    } else {
                      navigator.mediaDevices.enumerateDevices().then((devices) => {
                        const cams = devices.filter((d) => d.kind === "videoinput");
                        setVideoDevices(cams);
                        onVideoToggle(cams[0]?.deviceId);
                      }).catch(() => onVideoToggle());
                    }
                  }}
                  className={`btn-icon-gear ${videoEnabled ? "active" : ""}`}
                  title={videoEnabled ? t("voice.camera.off") : t("voice.camera.on")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12m-3.5 0a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
                </button>

                {/* More controls popover */}
                <div className="voice-more-wrap" ref={moreVoiceRef}>
                  <button
                    className={`btn-icon-gear ${(sharing || isWhispering || hubStreamsCount > 0) ? "active" : ""}`}
                    onClick={() => setMoreVoiceOpen((v) => !v)}
                    title={t("voice.more")}
                    aria-expanded={moreVoiceOpen}
                  >
                    ···
                  </button>
                  {moreVoiceOpen && (
                    <div className="voice-more-menu">
                      <button
                        className={`voice-more-item ${sharing ? "active" : ""}`}
                        onClick={() => { onScreenShare(); setMoreVoiceOpen(false); }}
                        title={sharing ? t("voice.screen_share.stop") : t("voice.screen_share")}
                      >
                        {/* Feather "monitor" — the old filled path was corrupted
                            (no right bezel; looked cut off). Matches web's ScreenShareIcon. */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        {sharing ? t("voice.screen_share.stop") : t("voice.screen_share")}
                      </button>
                      {hubStreamsCount > 0 && (
                        <button
                          className="voice-more-item"
                          onClick={() => { onToggleHubStreams(); setMoreVoiceOpen(false); }}
                          title={`Hub streams (${hubStreamsCount} active)`}
                        >
                          📺 {t("voice.hub_streams", "Hub streams")}
                          <span className="hub-streams-badge" style={{ marginLeft: 4 }}>{hubStreamsCount}</span>
                        </button>
                      )}
                      <button
                        ref={whisperBtnRef}
                        className={`voice-more-item ${isWhispering ? "active" : ""}`}
                        onClick={() => { onToggleWhisperPanel(); setMoreVoiceOpen(false); }}
                        title="Whisper"
                        aria-pressed={isWhispering}
                      >
                        🤫 {t("voice.whisper", "Whisper")}
                      </button>
                    </div>
                  )}
                </div>
                {showWhisperPanel && whisperPanelPos && createPortal(
                  <div style={{ position: "fixed", bottom: whisperPanelPos.bottom, left: whisperPanelPos.left, zIndex: 9999 }}>
                    <WhisperPanel
                      voiceParticipants={
                        voiceChannelId
                          ? (voicePartByChannel[voiceChannelId] ?? [])
                          : []
                      }
                      voiceChannels={channels.filter(c => !c.is_category)}
                      isWhispering={isWhispering}
                      whisperTargets={whisperTargets}
                      whisperLists={whisperLists}
                      onStartWhisper={onStartWhisper}
                      onStopWhisper={onStopWhisper}
                      onSaveList={onSaveWhisperList}
                      onDeleteList={onDeleteWhisperList}
                      onClose={onCloseWhisperPanel}
                    />
                  </div>,
                  document.body
                )}
                <button
                  onClick={onVoiceLeave}
                  className="btn-icon-gear voice-call-btn end"
                  title={t("voice.leave")}
                  aria-label={t("voice.leave")}
                >
                  <PhoneOffIcon />
                </button>
              </div>
            </div>
          </>
        )}

        <div className="user-identity">
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div className="user-identity-avatar" />
            <span className={`user-status-dot status-${myStatus ?? "online"}`} />
          </div>
          <div
            ref={statusMenuRef}
            className="user-identity-details"
            style={onSetStatus ? { cursor: "pointer" } : undefined}
            onClick={onSetStatus ? () => setShowStatusMenu((v) => !v) : undefined}
          >
            <span className="user-identity-name" title={publicKey ?? undefined}>
              {myDisplayName || publicKey?.slice(0, 12) || "You"}
            </span>
            {myStatusCustom && (
              <span className="user-identity-custom-status" title={myStatusCustom}>
                {myStatusCustom}
              </span>
            )}
            {showStatusMenu && onSetStatus && (
              <div className="status-menu" onClick={(e) => e.stopPropagation()}>
                {(["online", "away", "dnd"] as const).map((s) => (
                  <button
                    key={s}
                    className={`status-menu-item ${(myStatus ?? "online") === s ? "active" : ""}`}
                    onClick={() => {
                      // "Online" means back-to-normal: clear the custom text too.
                      onSetStatus(s, s === "online" ? null : statusCustomDraft.trim() || null);
                      setShowStatusMenu(false);
                    }}
                  >
                    <span className={`user-status-dot status-${s}`} style={{ marginRight: 6, position: "static" }} />
                    {t(`presence.${s}`)}
                  </button>
                ))}
                <input
                  type="text"
                  className="status-menu-custom"
                  placeholder={t("presence.custom_placeholder")}
                  value={statusCustomDraft}
                  maxLength={100}
                  onChange={(e) => setStatusCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onSetStatus((myStatus as "away" | "dnd" | null) ?? "online", statusCustomDraft.trim() || null);
                      setShowStatusMenu(false);
                    }
                    if (e.key === "Escape") setShowStatusMenu(false);
                  }}
                  style={{ margin: "4px 6px", width: "calc(100% - 12px)", fontSize: "var(--text-xs)" }}
                />
              </div>
            )}
          </div>
          <button onClick={onOpenSettings} className="btn-icon-gear" title={t("settings.title")}>
            ⚙
          </button>
        </div>
      </div>
    </nav>
  );
}
