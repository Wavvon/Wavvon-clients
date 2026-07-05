import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VoiceParticipant, SoundboardClip } from "../types";
import type { SoundboardChip } from "../hooks/useSoundboardChips";
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
  User,
  AllianceInfo,
  AllianceSharedChannel,
  Conversation,
} from "../types";
import type { TreeNode, FlatNode } from "@wavvon/core";
import { channelPath, findTreeNode, formatPubkey } from "@wavvon/core";
import { PhoneOffIcon, ChannelIcon, PingIcon } from "./Icons";
import { SortableCategoryItem, SortableChannelItem } from "./SortableItems";
import { SoundboardPopover } from "./SoundboardPopover";
import { HoverSubmenu } from "@wavvon/ui";
import {
  DRILL_DEPTH, computeIndent, resolveDrillInScope,
  flattenAllianceChannels, allianceChannelIcon,
} from "./channelSidebarLayout";
import { isSpawnerChannel, resolveOwnerDisplayName } from "../utils/spawnerChannels";

interface SidebarFlatNode extends FlatNode {
  indentDepth: number;
}

// A category can end up with zero visible descendant channels either
// because it's freshly created and empty (admins build structure
// top-down) or because the server filtered out every descendant channel
// for READ_MESSAGES (nested-channels-ux.md §3.5). The two are
// indistinguishable client-side, so suppression is scoped to non-admins
// only — admins always need to see the categories they're building.
export function categoryHasVisibleChannel(node: TreeNode): boolean {
  for (const child of node.children) {
    if (!child.node.is_category) return true;
    if (categoryHasVisibleChannel(child)) return true;
  }
  return false;
}

function gainIcon(gainPct: number): string {
  if (gainPct === 0) return "🔇";
  if (gainPct < 100) return "🔉";
  if (gainPct === 100) return "🔊";
  return "⬆️";
}

function VoiceParticipantGainRow({
  participant,
  gainPct,
  onSetGain,
  isSelf,
}: {
  participant: VoiceParticipant;
  gainPct: number;
  onSetGain?: (g: number) => void;
  isSelf: boolean;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    function onOutside(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [popoverOpen]);

  const displayName = participant.display_name || participant.public_key.slice(0, 12);

  return (
    <div
      ref={rowRef}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", position: "relative" }}
    >
      <span
        style={{ flex: 1, fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={participant.public_key}
      >
        {displayName}
      </span>
      {!isSelf && onSetGain && (
        <>
          <button
            className="btn-icon-gear"
            style={{ fontSize: 12, padding: "0 2px" }}
            title={`Volume: ${gainPct}%`}
            onClick={() => setPopoverOpen((v) => !v)}
          >
            {gainIcon(gainPct)}
          </button>
          {popoverOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                right: 0,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                padding: "8px 10px",
                zIndex: 100,
                minWidth: 160,
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
            >
              <div style={{ fontSize: "var(--text-xs)", marginBottom: 6, color: "var(--text-muted)" }}>
                Volume: {gainPct}%
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={gainPct}
                onChange={(e) => onSetGain(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                <span>0%</span>
                <span>100%</span>
                <span>200%</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
  /** Gate for the per-channel settings gear. Wider than isAdmin: a
   * manage_roles member may open channel settings (Permissions tab).
   * Falls back to isAdmin when omitted. */
  canOpenChannelSettings?: boolean;
  /** Own presence: null/undefined = online, "away", "dnd". */
  myStatus?: string | null;
  /** Own custom status text shown under the display name. */
  myStatusCustom?: string | null;
  /** Present = footer identity opens the status picker. */
  onSetStatus?: (status: "online" | "away" | "dnd", custom: string | null) => void;
  hubNotifyMode: Record<string, NotifyMode>;
  hubDropdownOpen: boolean;
  hideSilenced?: boolean;
  silencedChannelIds?: Set<string>;
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
  onOpenChannelSettings?: (channel: Channel) => void;
  onVoiceJoin: (channel?: Channel) => void;
  onVoiceLeave: () => void;
  onSelectAllianceChannel: (alliance: AllianceInfo, channel: AllianceSharedChannel) => void;
  onSelectConversation: (conv: Conversation) => void;
  onOpenFriends?: () => void;
  onToggleSelfMute: () => void;
  onToggleSelfDeafen: () => void;
  onOpenSettings: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onToggleHideSilenced?: () => void;
  sharing?: boolean;
  onScreenShare?: () => void;
  voiceGains?: Record<string, number>;
  onSetVoiceGain?: (pk: string, gainPct: number) => void;
  canUseSoundboard?: boolean;
  onTriggerSoundboardClip?: (clip: SoundboardClip) => void;
  soundboardPlayingClipId?: string | null;
  soundboardChips?: SoundboardChip[];
}

export function ChannelSidebar({
  view, activeHubId, hubs, channels, selectedChannel,
  unreadByChannel, collapsedCategories,
  voicePartByChannel, voiceChannelId, selfMuted, selfDeafened,
  users, publicKey, pingByHub, isAdmin, canOpenChannelSettings, myStatus, myStatusCustom, onSetStatus, hubNotifyMode, hubDropdownOpen,
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
  onDragEnd, onToggleHideSilenced, sharing, onScreenShare,
  voiceGains, onSetVoiceGain,
  canUseSoundboard, onTriggerSoundboardClip, soundboardPlayingClipId, soundboardChips,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [hubCtxMenu, setHubCtxMenu] = useState<{ x: number; y: number } | null>(null);
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
  const hubHeaderRef = useRef<HTMLDivElement>(null);
  const [channelFocusIndex, setChannelFocusIndex] = useState(0);
  const channelItemRefs = useRef<(HTMLElement | null)[]>([]);
  const [focusedSubtreeId, setFocusedSubtreeId] = useState<string | null>(null);
  const [drillAnnouncement, setDrillAnnouncement] = useState("");

  // Drill-in focus is per-hub session state (not persisted): clear it when
  // the user switches hubs.
  useEffect(() => {
    setFocusedSubtreeId(null);
  }, [activeHubId]);

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

  const drillScope = useMemo(
    () => resolveDrillInScope(channelTree, focusedSubtreeId),
    [channelTree, focusedSubtreeId]
  );

  // The focused category can be deleted, or re-parented out from under
  // itself, while drilled in. Either way, once it's no longer resolvable
  // in the current tree we fall back to the full tree — clear the stale
  // focus id so the back-crumb bar doesn't linger with nothing to show.
  useEffect(() => {
    if (focusedSubtreeId && !findTreeNode(channelTree, focusedSubtreeId)) {
      setFocusedSubtreeId(null);
    }
  }, [channelTree, focusedSubtreeId]);

  const focusedRoot = focusedSubtreeId ? findTreeNode(channelTree, focusedSubtreeId) : null;

  const flatVisible = useMemo((): SidebarFlatNode[] => {
    const result: SidebarFlatNode[] = [];
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.node.is_category && !isAdmin && !categoryHasVisibleChannel(n)) continue;
        result.push({
          node: n.node,
          depth: n.depth,
          indentDepth: n.depth - drillScope.depthOffset,
          parentId: n.node.parent_id,
          childrenCount: n.children.length,
        });
        const collapsed = !!(activeHubId && collapsedCategories[activeHubId]?.[n.node.id]);
        if (!collapsed) walk(n.children);
      }
    }
    walk(drillScope.roots);
    const silenced = silencedChannelIds ?? new Set<string>();
    return result.filter((n) => n.node.is_category || !silenced.has(n.node.id));
  }, [drillScope, activeHubId, collapsedCategories, silencedChannelIds, isAdmin]);

  const activeNode = activeId ? flatVisible.find((n) => n.node.id === activeId) : null;

  function focusFirstVisibleItem() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setChannelFocusIndex(0);
        channelItemRefs.current[0]?.focus();
      });
    });
  }

  const { t } = useTranslation();

  function handleFocusSubtree(node: Channel) {
    setFocusedSubtreeId(node.id);
    setDrillAnnouncement(t("channel.sidebar.drill_in.announce", { name: node.name }));
    focusFirstVisibleItem();
  }

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);
  const myDisplayName = users.find((u) => u.public_key === publicKey)?.display_name;
  const activePing = activeHubId ? pingByHub[activeHubId] : undefined;
  const voiceChannelName = channels.find((c) => c.id === voiceChannelId)?.name;

  function resolveSoundboardChipName(pubkey: string): string {
    const known = users.find((u) => u.public_key === pubkey)?.display_name;
    if (known) return known;
    const inVoice = voiceChannelId
      ? voicePartByChannel[voiceChannelId]?.find((p) => p.public_key === pubkey)?.display_name
      : undefined;
    if (inVoice) return inVoice;
    return formatPubkey(pubkey);
  }

  const notifyModeLabels: Record<NotifyMode, string> = {
    all: t("hub.notifications.all"),
    mentions: t("hub.notifications.mentions"),
    silent: t("hub.notifications.silent"),
  };

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
      if (isSpawnerChannel(node.node)) {
        onVoiceJoin(node.node);
      } else {
        onSelectChannel(node.node);
      }
    }
  }, [flatVisible, activeHubId, collapsedCategories, onToggleCategoryCollapsed, onSelectChannel, onVoiceJoin]);

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
                <button className="hub-dropdown-item" onClick={() => { onHubDropdownOpenChange(false); onOpenCreateChannel(null, false); }}>
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
                onClick={() => { onHubDropdownOpenChange(false); onToggleHideSilenced?.(); }}
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

      <div
        className="sidebar-scroll"
        onContextMenu={view === "channels" ? (e) => {
          e.preventDefault();
          setHubCtxMenu({ x: e.clientX, y: e.clientY });
        } : undefined}
      >
        {view !== "dms" ? (
          <>
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {drillAnnouncement}
            </div>
            {focusedSubtreeId && focusedRoot && (
              <nav className="sidebar-drill-crumb" aria-label={t("channel.sidebar.drill_back.aria")}>
                <button
                  type="button"
                  className="sidebar-drill-crumb-item"
                  onClick={() => setFocusedSubtreeId(null)}
                >
                  {t("channel.sidebar.drill_back.root")}
                </button>
                {channelPath(channels, focusedSubtreeId).map((crumb, i, arr) => (
                  <React.Fragment key={crumb.id}>
                    <span className="sidebar-drill-crumb-sep" aria-hidden="true">›</span>
                    <button
                      type="button"
                      className={`sidebar-drill-crumb-item ${i === arr.length - 1 ? "current" : ""}`}
                      disabled={i === arr.length - 1}
                      onClick={() => setFocusedSubtreeId(crumb.id)}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </nav>
            )}
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
                  {flatVisible.map((n, index) => {
                    const indent = computeIndent(n.indentDepth);
                    return n.node.is_category ? (
                      <SortableCategoryItem
                        key={n.node.id}
                        channel={n.node}
                        collapsed={!!activeHubId && !!collapsedCategories[activeHubId]?.[n.node.id]}
                        childCount={n.childrenCount}
                        style={{ paddingLeft: indent.paddingLeft }}
                        depth={n.depth}
                        depthOverflow={indent.overflow}
                        isDragTarget={dragOverId === n.node.id}
                        tabIndex={channelFocusIndex === index ? 0 : -1}
                        itemRef={(el) => { channelItemRefs.current[index] = el; }}
                        onToggleCollapsed={() => {
                          if (activeHubId) onToggleCategoryCollapsed(activeHubId, n.node.id);
                        }}
                        onContextMenu={(e) => { e.stopPropagation(); onChannelContextMenu(e, n.node); }}
                        onKeyDown={(e) => handleChannelKeyDown(e, index)}
                        onAdd={() => onOpenCreateChannel(n.node.id, false)}
                        onSettings={(canOpenChannelSettings ?? isAdmin) && onOpenChannelSettings ? (_e) => onOpenChannelSettings!(n.node) : undefined}
                        onFocusSubtree={n.depth >= DRILL_DEPTH ? () => handleFocusSubtree(n.node) : undefined}
                        focusSubtreeLabel={t("channel.sidebar.drill_in", { name: n.node.name })}
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
                        // Full roster for every voice channel INCLUDING the one
                        // we're in — blanking our own channel (f3ee45e's
                        // "duplicate self" fix) meant you never saw yourself (or
                        // anyone) under the channel you joined. The footer voice
                        // bar duplicating this is fine: it's the controls
                        // surface (gain sliders); the row is who-is-where.
                        participants={voicePartByChannel[n.node.id] ?? []}
                        isCurrentVoiceChannel={voiceChannelId === n.node.id}
                        hubUrl={activeHub?.hub_url}
                        ownerDisplayName={resolveOwnerDisplayName(n.node.owner_pubkey, users)}
                        style={{ paddingLeft: indent.paddingLeft }}
                        depth={n.depth}
                        depthOverflow={indent.overflow}
                        tabIndex={channelFocusIndex === index ? 0 : -1}
                        itemRef={(el) => { channelItemRefs.current[index] = el; }}
                        onClick={() => {
                          setChannelFocusIndex(index);
                          if (isSpawnerChannel(n.node)) {
                            onVoiceJoin(n.node);
                          } else {
                            onSelectChannel(n.node);
                          }
                        }}
                        onDoubleClick={() => { if (!isSpawnerChannel(n.node) && voiceChannelId !== n.node.id) onVoiceJoin(n.node); }}
                        onContextMenu={(e) => { e.stopPropagation(); onChannelContextMenu(e, n.node); }}
                        onKeyDown={(e) => handleChannelKeyDown(e, index)}
                        onSettings={(canOpenChannelSettings ?? isAdmin) && onOpenChannelSettings ? (_e) => onOpenChannelSettings!(n.node) : undefined}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
              <DragOverlay>
                {activeNode && (
                  <div
                    className={`channel-drag-ghost ${activeNode.node.is_category ? "is-category" : ""}`}
                    style={{ paddingLeft: computeIndent(activeNode.indentDepth).paddingLeft }}
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
                  const flat = flattenAllianceChannels(remoteOnly);
                  return (
                    <div key={a.id} className="sidebar-alliance-group">
                      <div className="sidebar-header sidebar-header-alliance">
                        <h3>🤝 {a.name}</h3>
                      </div>
                      <ul className="channel-list">
                        {flat.map(({ channel: c, depth }) => {
                          const indentPx = 12 + depth * 14;
                          if (c.is_category) {
                            return (
                              <li
                                key={c.channel_id}
                                className="channel-item alliance-category"
                                style={{ paddingLeft: indentPx }}
                                title={`Hosted on ${c.hub_name}`}
                              >
                                {allianceChannelIcon(c)} {c.channel_name}
                              </li>
                            );
                          }
                          const clickable = c.channel_type === "text" || c.channel_type === "forum";
                          const isSelected =
                            selectedAllianceChannel?.alliance_id === a.id &&
                            selectedAllianceChannel.channel.channel_id === c.channel_id;
                          return (
                            <li
                              key={c.channel_id}
                              className={`channel-item ${isSelected ? "selected" : ""} ${clickable ? "" : "alliance-noninteractive"}`}
                              style={{ paddingLeft: indentPx }}
                              onClick={clickable ? () => onSelectAllianceChannel(a, c) : undefined}
                              title={`Hosted on ${c.hub_name}`}
                            >
                              {allianceChannelIcon(c)} {c.channel_name}
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
              {/* Friends is not built on web yet — only render the entry
                  point when a handler is actually wired (avoids a dead
                  button). Tracked in docs/client-parity.md. */}
              {onOpenFriends && (
                <button className="btn-icon" onClick={onOpenFriends} title={t("friends.title")}>
                  👥
                </button>
              )}
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
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); onOpenCreateChannel(null, false); }}>
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
              onClick={() => { setHubCtxMenu(null); onToggleHideSilenced?.(); }}
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
                {onScreenShare && (
                  <button
                    onClick={onScreenShare}
                    className={`btn-icon-gear ${sharing ? "active" : ""}`}
                    title={sharing ? t("voice.screen_share.stop") : t("voice.screen_share")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6l-1 3h6l-1-3h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z"/></svg>
                  </button>
                )}
                {canUseSoundboard && onTriggerSoundboardClip && (
                  <SoundboardPopover
                    onTrigger={onTriggerSoundboardClip}
                    playingClipId={soundboardPlayingClipId ?? null}
                  />
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
            {voiceChannelId && (voicePartByChannel[voiceChannelId]?.length ?? 0) > 0 && (
              <div className="voice-participants-list">
                {voicePartByChannel[voiceChannelId].map((p) => (
                  <VoiceParticipantGainRow
                    key={p.public_key}
                    participant={p}
                    gainPct={voiceGains?.[p.public_key] ?? 100}
                    onSetGain={onSetVoiceGain ? (g) => onSetVoiceGain(p.public_key, g) : undefined}
                    isSelf={p.public_key === publicKey}
                  />
                ))}
              </div>
            )}
            {soundboardChips && soundboardChips.length > 0 && (
              <div className="soundboard-chips">
                {soundboardChips.map((chip) => (
                  <span key={chip.id} className="soundboard-chip">
                    {t("voice.soundboard_played", {
                      name: resolveSoundboardChipName(chip.public_key),
                      clip: chip.clip_name,
                    })}
                  </span>
                ))}
              </div>
            )}
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
