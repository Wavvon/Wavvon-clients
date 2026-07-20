import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
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
import type { Channel, TreeNode, FlatNode } from "@wavvon/core";
import { channelPath, findTreeNode, formatPubkey } from "@wavvon/core";
import type {
  Hub,
  NotifyMode,
  User,
  VoiceParticipant,
  AllianceInfo,
  AllianceSharedChannel,
  Conversation,
  SoundboardClip,
  SoundboardChip,
  WhisperTarget,
  WhisperList,
} from "../../types";
import { PhoneOffIcon, ChannelIcon, PingIcon, MicOnIcon, MicOffIcon, DeafenIcon, ScreenShareIcon, CameraOnIcon, CameraOffIcon } from "../Icons";
import { SortableCategoryItem, SortableChannelItem } from "../SortableItems";
import { HoverSubmenu } from "../HoverSubmenu";
import { SoundboardPopover } from "../voice/SoundboardPopover";
import { WhisperPanel } from "../voice/WhisperPanel";
import {
  DRILL_DEPTH, computeIndent, resolveDrillInScope,
  flattenAllianceChannels, allianceChannelIcon,
} from "./channelSidebarLayout";
import { isSpawnerChannel, resolveOwnerDisplayName } from "../../utils/spawnerChannels";

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

// Drag-resize bounds for the channel sidebar. The lower bound keeps the
// voice-controls footer usable; the upper bound protects the message pane.
const SIDEBAR_MIN_W = 220;
const SIDEBAR_MAX_W = 480;
const SIDEBAR_DEFAULT_W = 260;
const SIDEBAR_WIDTH_KEY = "wavvon.sidebarWidth";

function loadSidebarWidth(): number {
  try {
    const n = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? "", 10);
    if (Number.isFinite(n)) return Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, n));
  } catch { /* ignore */ }
  return SIDEBAR_DEFAULT_W;
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
  /** Overrides the looked-up channel name for the voice HUD label — set from a
   *  voice_move push's `target_channel_name` (events.md §7.1), since a
   *  voice-only-presence destination may not be in the local channel list. */
  voiceChannelNameHint?: string | null;
  selfMuted: boolean;
  selfDeafened: boolean;
  users: User[];
  publicKey: string | null;
  pingByHub: Record<string, number | null>;
  isAdmin: boolean;
  /** Gate for the "Invite people" entry. Wider than isAdmin: a manage_channels
   *  member can create invites too, just via the compact quick-invite modal
   *  rather than the full admin panel. Falls back to isAdmin when omitted. */
  canCreateInvites?: boolean;
  /** Gate for the per-channel settings gear. Wider than isAdmin: a
   * manage_roles member may open channel settings (Permissions tab).
   * Falls back to isAdmin when omitted. */
  canOpenChannelSettings?: boolean;
  /** Own presence: null/undefined = online, "away", "dnd", "invisible". */
  myStatus?: string | null;
  /** Present = footer identity opens the status picker. `ttlMinutes` is an
   *  optional "clear after" duration (reverts to online), null = no expiry. */
  onSetStatus?: (status: "online" | "away" | "dnd" | "invisible", ttlMinutes: number | null) => void;
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
  onOpenQuickInvite?: () => void;
  onOpenCreateChannel: (parentId: string | null, isCategory: boolean) => void;
  onSelectChannel: (channel: Channel) => void;
  onChannelContextMenu: (e: React.MouseEvent, channel: Channel) => void;
  onOpenChannelSettings?: (channel: Channel) => void;
  onVoiceJoin: (channel?: Channel) => void;
  onVoiceLeave: () => void;
  /** Right-click on a voice-roster participant — the mover's "Move to channel…" surface (events.md §7.1). */
  onParticipantContextMenu?: (e: React.MouseEvent, participant: VoiceParticipant, channelId: string) => void;
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
  /** Present = video toggle enumerates cameras and picks the first available
   *  device when turning video on (the callee decides what to do with it). */
  videoEnabled?: boolean;
  onToggleVideo?: (deviceId?: string) => void;
  voiceGains?: Record<string, number>;
  onSetVoiceGain?: (pk: string, gainPct: number) => void;
  /** Pubkeys currently whispering to the local user. */
  inboundWhispers?: Set<string>;
  /** Unsent-draft lookup, keyed by `${hubId}/${channelId}`. Omit to hide the badge. */
  hasDraft?: (draftKey: string) => boolean;
  /** Present = render the global-search trigger button above the channel list. */
  onOpenSearch?: () => void;
  /** Present = render the hub-streams toggle in the voice footer. */
  hubStreamsCount?: number;
  onToggleHubStreams?: () => void;
  /** Whisper (events.md whisper follow-up): named target lists (save/load/delete)
   *  are folded in as optional props — present only where the caller has the
   *  backing commands wired. */
  isWhispering?: boolean;
  whisperTargets?: WhisperTarget[];
  whisperLists?: WhisperList[];
  showWhisperPanel?: boolean;
  onToggleWhisperPanel?: () => void;
  onCloseWhisperPanel?: () => void;
  onStartWhisper?: (targets: WhisperTarget[]) => void;
  onStopWhisper?: () => void;
  onSaveWhisperList?: (list: WhisperList) => void;
  onDeleteWhisperList?: (id: string) => void;
  canUseSoundboard?: boolean;
  onListSoundboardClips?: () => Promise<SoundboardClip[]>;
  onTriggerSoundboardClip?: (clip: SoundboardClip) => void;
  soundboardPlayingClipId?: string | null;
  soundboardChips?: SoundboardChip[];
}

export function ChannelSidebar({
  view, activeHubId, hubs, channels, selectedChannel,
  unreadByChannel, collapsedCategories,
  voicePartByChannel, voiceChannelId, voiceChannelNameHint, selfMuted, selfDeafened,
  users, publicKey, pingByHub, isAdmin, canCreateInvites, canOpenChannelSettings, myStatus, onSetStatus, hubNotifyMode, hubDropdownOpen,
  hideSilenced, silencedChannelIds,
  userAlliances, allianceChannels, selectedAllianceChannel,
  conversations, selectedConversation, unreadDms,
  channelTree, effectiveNotifyMode, onToggleCategoryCollapsed,
  onHubDropdownOpenChange, onSetHubMode, onClearHubUnread, onRemoveHub,
  onOpenHubAdmin, onOpenHubAdminInvites, onOpenQuickInvite, onOpenCreateChannel,
  onSelectChannel, onChannelContextMenu, onOpenChannelSettings,
  onVoiceJoin, onVoiceLeave, onParticipantContextMenu,
  onSelectAllianceChannel, onSelectConversation,
  onOpenFriends, onToggleSelfMute, onToggleSelfDeafen, onOpenSettings,
  onDragEnd, onToggleHideSilenced, sharing, onScreenShare,
  videoEnabled, onToggleVideo,
  voiceGains, onSetVoiceGain, inboundWhispers, hasDraft,
  onOpenSearch, hubStreamsCount, onToggleHubStreams,
  isWhispering, whisperTargets, whisperLists, showWhisperPanel,
  onToggleWhisperPanel, onCloseWhisperPanel, onStartWhisper, onStopWhisper,
  onSaveWhisperList, onDeleteWhisperList,
  canUseSoundboard, onListSoundboardClips, onTriggerSoundboardClip, soundboardPlayingClipId, soundboardChips,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [hubCtxMenu, setHubCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  // "Clear after" duration (minutes) for the next status pick; 0 = no expiry.
  const [ttlDraft, setTtlDraft] = useState(0);
  const statusMenuRef = useRef<HTMLDivElement>(null);
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
  const [sidebarWidth, setSidebarWidth] = useState<number>(loadSidebarWidth);
  const resizeDragRef = useRef<{ startX: number; origW: number } | null>(null);

  function onResizeStart(e: React.PointerEvent) {
    resizeDragRef.current = { startX: e.clientX, origW: sidebarWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: React.PointerEvent) {
    const d = resizeDragRef.current;
    if (!d) return;
    setSidebarWidth(Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, d.origW + (e.clientX - d.startX))));
  }
  function onResizeEnd() {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    setSidebarWidth((w) => {
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w)); } catch { /* ignore */ }
      return w;
    });
  }

  const hubHeaderRef = useRef<HTMLDivElement>(null);
  const [channelFocusIndex, setChannelFocusIndex] = useState(0);
  const channelItemRefs = useRef<(HTMLElement | null)[]>([]);
  const [focusedSubtreeId, setFocusedSubtreeId] = useState<string | null>(null);
  const [drillAnnouncement, setDrillAnnouncement] = useState("");
  const whisperBtnRef = useRef<HTMLButtonElement>(null);
  const [whisperPanelPos, setWhisperPanelPos] = useState<{ bottom: number; left: number } | null>(null);

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

  useEffect(() => {
    if (!showWhisperPanel || !whisperBtnRef.current) return;
    const rect = whisperBtnRef.current.getBoundingClientRect();
    setWhisperPanelPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
  }, [showWhisperPanel]);

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
    if (!hideSilenced) return result;
    const silenced = silencedChannelIds ?? new Set<string>();
    return result.filter((n) => n.node.is_category || !silenced.has(n.node.id));
  }, [drillScope, activeHubId, collapsedCategories, silencedChannelIds, hideSilenced, isAdmin]);

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
  const voiceChannelName = voiceChannelNameHint ?? channels.find((c) => c.id === voiceChannelId)?.name;

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

  function handleToggleVideo() {
    if (!onToggleVideo) return;
    if (videoEnabled) { onToggleVideo(); return; }
    // Turning video on: auto-pick the first available camera when the
    // platform exposes device enumeration (desktop's quick-toggle picker —
    // web omits this until WebVideoSession supports device selection).
    navigator.mediaDevices?.enumerateDevices()
      .then((devices) => {
        const cam = devices.find((d) => d.kind === "videoinput");
        onToggleVideo(cam?.deviceId);
      })
      .catch(() => onToggleVideo());
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
    <nav className="sidebar" style={{ width: sidebarWidth }} aria-label={t("channel.sidebar.label")}>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("channel.sidebar.resize")}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={() => {
          setSidebarWidth(SIDEBAR_DEFAULT_W);
          try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_W)); } catch { /* ignore */ }
        }}
      />
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
              {(canCreateInvites ?? isAdmin) && (
                <button className="hub-dropdown-item" onClick={() => { onHubDropdownOpenChange(false); isAdmin ? onOpenHubAdminInvites() : onOpenQuickInvite?.(); }}>
                  {t("hub.invite_people")}
                </button>
              )}
              {isAdmin && (
                <button className="hub-dropdown-item" onClick={() => { onHubDropdownOpenChange(false); onOpenHubAdmin(); }}>
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

      {view === "channels" && onOpenSearch && (
        <button
          className="btn-ghost"
          style={{ width: "100%", textAlign: "left", padding: "6px 12px" }}
          onClick={onOpenSearch}
        >
          🔍 {t("search.placeholder")}
        </button>
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
                        voiceGains={voiceGains}
                        onSetVoiceGain={onSetVoiceGain}
                        inboundWhispers={inboundWhispers}
                        hasDraft={hasDraft}
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
                        onParticipantContextMenu={onParticipantContextMenu ? (e, p) => onParticipantContextMenu(e, p, n.node.id) : undefined}
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
              {/* Friends is only rendered when a handler is actually wired
                  (avoids a dead button on callers that haven't built it yet). */}
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
            {(canCreateInvites ?? isAdmin) && (
              <button className="context-menu-item" onClick={() => { setHubCtxMenu(null); isAdmin ? onOpenHubAdminInvites() : onOpenQuickInvite?.(); }}>
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
              {activePing !== undefined && <PingIcon ping={activePing} />}
              <span className="voice-status-label">#{voiceChannelName}</span>
              <button
                onClick={onVoiceLeave}
                className="btn-icon-gear voice-call-btn end"
                title={t("voice.leave")}
                aria-label={t("voice.leave")}
              >
                <PhoneOffIcon />
              </button>
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
                  {selfMuted ? <MicOffIcon /> : <MicOnIcon />}
                </button>
                <button
                  onClick={onToggleSelfDeafen}
                  className={`btn-icon-gear ${selfDeafened ? "active" : ""}`}
                  aria-pressed={selfDeafened}
                  aria-label={selfDeafened ? t("voice.undeafen") : t("voice.deafen")}
                  title={selfDeafened ? t("voice.undeafen") : t("voice.deafen")}
                >
                  <DeafenIcon muted={selfDeafened} />
                </button>
                {onScreenShare && (
                  <button
                    onClick={onScreenShare}
                    className={`btn-icon-gear ${sharing ? "active" : ""}`}
                    title={sharing ? t("voice.screen_share.stop") : t("voice.screen_share")}
                  >
                    <ScreenShareIcon />
                  </button>
                )}
                {onToggleVideo && (
                  <button
                    onClick={handleToggleVideo}
                    className={`btn-icon-gear ${videoEnabled ? "active" : ""}`}
                    title={videoEnabled ? t("voice.camera.off") : t("voice.camera.on")}
                    aria-label={videoEnabled ? t("voice.camera.off") : t("voice.camera.on")}
                  >
                    {videoEnabled ? <CameraOnIcon /> : <CameraOffIcon />}
                  </button>
                )}
                {onToggleHubStreams && (
                  <button
                    onClick={onToggleHubStreams}
                    className={`btn-icon-gear ${hubStreamsCount ? "active" : ""}`}
                    title={t("voice.hub_streams", "Hub streams")}
                  >
                    📺{!!hubStreamsCount && <span className="hub-streams-badge" style={{ marginLeft: 4 }}>{hubStreamsCount}</span>}
                  </button>
                )}
                {onToggleWhisperPanel && (
                  <button
                    ref={whisperBtnRef}
                    onClick={onToggleWhisperPanel}
                    className={`btn-icon-gear ${isWhispering ? "active" : ""}`}
                    title={t("voice.whisper", "Whisper")}
                    aria-pressed={!!isWhispering}
                  >
                    🤫
                  </button>
                )}
                {showWhisperPanel && whisperPanelPos && onCloseWhisperPanel && createPortal(
                  <div style={{ position: "fixed", bottom: whisperPanelPos.bottom, left: whisperPanelPos.left, zIndex: 9999 }}>
                    <WhisperPanel
                      voiceParticipants={
                        voiceChannelId
                          ? (voicePartByChannel[voiceChannelId] ?? [])
                          : []
                      }
                      voiceChannels={channels.filter(c => !c.is_category)}
                      isWhispering={!!isWhispering}
                      whisperTargets={whisperTargets ?? []}
                      whisperLists={whisperLists ?? []}
                      onStartWhisper={onStartWhisper ?? (() => {})}
                      onStopWhisper={onStopWhisper ?? (() => {})}
                      onSaveList={onSaveWhisperList ?? (() => {})}
                      onDeleteList={onDeleteWhisperList ?? (() => {})}
                      onClose={onCloseWhisperPanel}
                    />
                  </div>,
                  document.body
                )}
                {canUseSoundboard && onTriggerSoundboardClip && onListSoundboardClips && (
                  <SoundboardPopover
                    onListClips={onListSoundboardClips}
                    onTrigger={onTriggerSoundboardClip}
                    playingClipId={soundboardPlayingClipId ?? null}
                  />
                )}
              </div>
            </div>
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
            {showStatusMenu && onSetStatus && (
              <div className="status-menu" onClick={(e) => e.stopPropagation()}>
                {(["online", "away", "dnd", "invisible"] as const).map((s) => (
                  <button
                    key={s}
                    className={`status-menu-item ${(myStatus ?? "online") === s ? "active" : ""}`}
                    onClick={() => {
                      onSetStatus(s, s === "online" || ttlDraft === 0 ? null : ttlDraft);
                      setShowStatusMenu(false);
                    }}
                  >
                    <span className={`user-status-dot status-${s}`} style={{ marginRight: 6, position: "static" }} />
                    {t(`presence.${s}`)}
                  </button>
                ))}
                {/* "Clear after": auto-revert to Online. Not applicable to
                    Online itself, so it only affects away/dnd/invisible picks. */}
                <label className="status-menu-ttl">
                  <span>{t("presence.clear_after")}</span>
                  <select
                    value={ttlDraft}
                    onChange={(e) => setTtlDraft(Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value={0}>{t("presence.ttl.off")}</option>
                    <option value={30}>{t("presence.ttl.30m")}</option>
                    <option value={60}>{t("presence.ttl.1h")}</option>
                    <option value={180}>{t("presence.ttl.3h")}</option>
                  </select>
                </label>
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
