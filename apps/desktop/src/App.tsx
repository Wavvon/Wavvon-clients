// App.tsx — Root component
//
// React concepts for Blazor devs:
// - useState(initial) returns [value, setter] — private field + setter
// - useEffect(fn, [deps]) runs fn when deps change — like OnParametersSet
// - useRef(initial) persists a value across renders — like a field that doesn't trigger re-render
// - Event handlers use camelCase: onClick, onChange, onSubmit

import React, { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type {
  Channel,
  Attachment,
  ReplyContext,
  Message,
  NotifyMode,
  User,
  VoiceParticipant,
  Hub,
  RoleInfo,
  RoleCategory,
  MeInfo,
  MemberAdminInfo,
  BanInfo,
  InviteInfo,
  PendingUser,
  Friend,
  Conversation,
  DmMessage,
  AllianceInfo,
  AllianceSharedChannel,
  ActiveStream,
  LobbyStatus,
  SurveySubmitResult,
  BotAdminInfo,
  BotDetailInfo,
  BotCreatedResult,
  TauriFile,
  BotAppLaunchEvent,
  BotAppOpenEvent,
  BotAppCloseEvent,
  FarmPublicInfo,
  FarmHubQuota,
  CreatedFarmHub,
  FarmSettings,
  FarmHubEntry,
  FarmUserEntry,
  FarmServerEntry,
  PublicHubProfile,
  PresenceStatus,
  ForumTagDef,
} from "./types";
import { ScreenShareModal } from "./components/ScreenShareModal";
import { ScreenShareOverlay } from "./components/ScreenShareOverlay";
import { HubStreamsPanel } from "@wavvon/ui";
import { BotAppLaunchCard, CreateHubWizard, KeyboardShortcuts, DiscoverPage, Lobby, FarmSettingsPage } from "@wavvon/ui";
import { VoiceMoveMenu, VoiceMoveToast, VoiceMovePromptModal, SearchBar, moveChannelOptions, decideVoiceMove } from "@wavvon/ui";
import type { GlobalSearchResult } from "@wavvon/ui";
import { useVoice } from "./hooks/useVoice";
import { useSoundboard } from "./hooks/useSoundboard";
import { useVideo } from "./hooks/useVideo";
import { useWhisper } from "./hooks/useWhisper";
import { VideoGrid } from "./components/VideoGrid";
import { type ThemeId, type WavvonSkin, applySkinTokens, clearSkinTokens } from "@wavvon/ui";
import {
  formatPubkey,
  buildChannelTree,
  flattenTree,
  descendantIds,
  computeDepth,
} from "@wavvon/core";
import { parseHubInput } from "@wavvon/core";
import { saveDraft, hasDraft } from "./utils/drafts";
import { useNotificationPrefs } from "./hooks/useNotificationPrefs";
import { useUnreadCounts } from "./hooks/useUnreadCounts";
import { useTypingIndicators } from "./hooks/useTypingIndicators";
import { useHubConnections } from "./hooks/useHubConnections";
import { useHubAdmin } from "./hooks/useHubAdmin";
import { useFriends } from "./hooks/useFriends";
import { useSettingsProfile } from "./hooks/useSettingsProfile";
import { useDms } from "./hooks/useDms";
import { useChannelMessages } from "./hooks/useChannelMessages";
import { useAlliances } from "./hooks/useAlliances";
import { useWsHandlers } from "./hooks/useWsHandlers";
import { Lightbox } from "./components/Lightbox";
import { ChannelPalette } from "./components/ChannelPalette";
import {
  SettingsPage,
  type SettingsTab,
} from "./components/SettingsPage";
import {
  HubAdminPage,
  type HubAdminTab,
  type RolesSectionActions,
  type MemberRoleManagerActions,
  type ServerTagsSectionActions,
  type InviteManagerActions,
  type NativeBotsSectionActions,
  type AuditLogSectionActions,
  type CertificationsSectionActions,
  type OnboardingAdminSectionActions,
} from "@wavvon/ui";
import type {
  Alliance,
  AllianceInvite,
  PendingAllianceInvite,
  SharedChannel,
  ExternalBotRow,
  ExternalBotInviteResult,
  WebhookInfo,
  WebhookCreatedResult,
  SurveyAdmin,
  SurveyResponseView,
  HubSelfTagSettings,
  HubBadge,
  PendingBadgeOffer,
  CertIssuance,
  CertAdmissionSettings,
  AuditLogPage,
} from "@wavvon/ui";
import { AddHubModal } from "@wavvon/ui";
import { QuickInviteModal } from "@wavvon/ui";
import type { FarmAdminTab } from "@wavvon/ui";
import { CreateChannelModal, type BannerSource } from "@wavvon/ui";
import { ChannelSettingsModal } from "@wavvon/ui";
import type {
  ChannelPermissionsTabActions,
  ChannelBansTabActions,
  ChannelTalkPowerTabActions,
  ChannelPermissionsResponse,
  ChannelRoleOverwrites,
  ChannelRolePermissions,
  HubIcon,
} from "@wavvon/ui";
import { FriendsModal } from "@wavvon/ui";
import { EditDescriptionModal } from "./components/EditDescriptionModal";
import { ChannelContextMenu } from "./components/ChannelContextMenu";
import { ChannelAppearanceModal } from "./components/ChannelAppearanceModal";
import { BannerEditModal } from "./components/BannerEditModal";
import { UserContextMenu } from "@wavvon/ui";
import { HubSidebar } from "@wavvon/ui";
import { ChannelSidebar } from "@wavvon/ui";
import { ContentArea } from "./components/ContentArea";
import { fetchWithTimeout } from "./utils/fetchWithTimeout";
import { HubBrowser } from "./components/HubBrowser";
import { WelcomeScreen } from "@wavvon/ui";
import { BotChallenge } from "./components/BotChallenge";
import { SurveyComponent } from "./components/Survey";
import { UpdateBanner } from "./components/UpdateBanner";
import { setSwitchGuard } from "./accounts/store";

function App() {
  // Multi-hub state
  const [hubs, setHubs] = useState<Hub[]>([]);
  // Active hub's ambient IANA timezone (HubClock in the sidebar header) —
  // member-facing, fetched alongside the rest of loadHubData rather than
  // gated behind opening the admin panel.
  const [activeHubTimezone, setActiveHubTimezone] = useState<string | null>(null);
  const hubsRef = useRef<Hub[]>([]);
  useEffect(() => { hubsRef.current = hubs; }, [hubs]);
  const [activeHubId, setActiveHubId] = useState<string | null>(null);
  const [showAddHub, setShowAddHub] = useState(false);
  const [showQuickInvite, setShowQuickInvite] = useState(false);
  const [hubScope, setHubScope] = useState<Record<string, "lobby" | "member">>({});
  const lobbyHubIds = useMemo(
    () => new Set(Object.entries(hubScope).filter(([, scope]) => scope === "lobby").map(([id]) => id)),
    [hubScope],
  );
  const [pendingSurveyHubId, setPendingSurveyHubId] = useState<string | null>(null);
  const [botChallenge, setBotChallenge] = useState<{
    hubUrl: string;
    pubkey: string;
    resolvedUrl: string;
  } | null>(null);
  const [hubPreview, setHubPreview] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | {
        state: "ok";
        url: string;
        name: string;
        description?: string | null;
        icon?: string | null;
        invite_only?: boolean;
        min_security_level?: number;
        challenge_mode?: string | null;
      }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [hubUrl, setHubUrl] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const {
    unreadByChannel,
    unreadByHub,
    bumpUnread,
    clearUnread,
    clearHubUnread,
  } = useUnreadCounts();

  const {
    hubNotifyMode,
    channelNotifyMode,
    setHubMode,
    setChannelMode,
  } = useNotificationPrefs();

  // Blocked users: pubkey set. Persisted to ~/.wavvon/blocked_users.json so
  // the choice carries across sessions. Used to filter out their messages
  // from channel + DM views without involving any hub state.
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  function toggleBlockUser(pubkey: string) {
    setBlockedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      const list = Array.from(next);
      invoke("save_blocked_users", { blocked: list }).catch(() => {});
      invoke("update_dm_blocks", { blocked: list }).catch(() => {});
      return next;
    });
  }

  const [ignoredUsers, setIgnoredUsers] = useState<Set<string>>(new Set());

  function toggleIgnoreUser(pubkey: string) {
    setIgnoredUsers((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      invoke("save_ignored_users", { ignored: Array.from(next) }).catch(() => {});
      return next;
    });
  }

  // Own presence — global across hubs, not per-hub. The device is the
  // source of truth: the picker broadcasts to every session and each hub
  // gets it re-applied on (re)connect. Distinct from hub mute (notify modes).
  // Four states + "clear after" TTL (decisions.md 2026-07-12) — free-text
  // custom status was removed; the hub column stays dormant.
  const [myPresence, setMyPresenceState] = useState<{ status: PresenceStatus }>(() => {
    try {
      const raw = localStorage.getItem("wavvon.presence");
      if (raw) return JSON.parse(raw) as { status: PresenceStatus };
    } catch { /* storage unavailable or corrupt */ }
    return { status: "online" };
  });
  const myPresenceRef = useRef(myPresence);
  myPresenceRef.current = myPresence;
  // Timer backing the presence "clear after" (TTL): reverts to Online when it fires.
  const presenceTtlRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSetStatus(status: PresenceStatus, ttlMinutes: number | null) {
    if (presenceTtlRef.current) { clearTimeout(presenceTtlRef.current); presenceTtlRef.current = null; }
    const apply = (s: PresenceStatus) => {
      setMyPresenceState({ status: s });
      try { localStorage.setItem("wavvon.presence", JSON.stringify({ status: s })); } catch { /* storage unavailable */ }
      invoke("send_all_hubs_ws_raw", {
        payload: JSON.stringify({ type: "set_status", status: s, custom: null }),
      }).catch(() => { /* no hub connected */ });
      // Optimistic: the hubs' member_status broadcasts will confirm. Invisible
      // shows the user offline (to everyone, incl. their own roster view); the
      // footer picker still reflects "invisible".
      setUsers((prev) => prev.map((u) =>
        u.public_key === publicKey
          ? { ...u, online: s !== "invisible", status: s === "online" || s === "invisible" ? null : s, status_custom: null }
          : u,
      ));
    };
    apply(status);
    if (status !== "online" && ttlMinutes) {
      presenceTtlRef.current = setTimeout(() => {
        presenceTtlRef.current = null;
        apply("online");
      }, ttlMinutes * 60_000);
    }
  }


  // Collapsed categories: hub_id -> { category_id: true }. Persisted so a
  // folded category stays folded across restarts. Categories not in the
  // map render expanded by default.
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, Record<string, boolean>>
  >({});

  function toggleCategoryCollapsed(hubId: string, categoryId: string) {
    setCollapsedCategories((prev) => {
      const hubMap = { ...(prev[hubId] ?? {}) };
      if (hubMap[categoryId]) delete hubMap[categoryId];
      else hubMap[categoryId] = true;
      const next = { ...prev, [hubId]: hubMap };
      invoke("save_collapsed_categories", { state: next }).catch(() => {});
      return next;
    });
  }

  const {
    hubConnected,
    reconnectingHubs,
    setHubConnected,
    scheduleReconnect,
    clearReconnectTimer,
    setReconnecting,
    resetAttempts,
    onHubReconnected,
    onHubRemoved: onHubRemovedReconnect,
    cancelAllReconnectTimers,
  } = useHubConnections();

  function effectiveNotifyMode(hubId: string, channelId: string): NotifyMode {
    let id: string | null = channelId;
    while (id !== null) {
      const mode = channelNotifyMode[hubId]?.[id];
      if (mode !== undefined) return mode;
      const ch = channels.find((c) => c.id === id);
      id = ch?.parent_id ?? null;
    }
    return hubNotifyMode[hubId] ?? "all";
  }



  // Hydrate collapsed-category state on launch.
  useEffect(() => {
    invoke<Record<string, Record<string, boolean>>>("load_collapsed_categories")
      .then((s) => setCollapsedCategories(s ?? {}))
      .catch(console.error);
  }, []);

  // Hydrate blocked-users list on launch.
  useEffect(() => {
    invoke<string[]>("load_blocked_users")
      .then((s) => setBlockedUsers(new Set(s ?? [])))
      .catch(console.error);

    invoke<string[]>("load_ignored_users")
      .then((s) => setIgnoredUsers(new Set(s ?? [])))
      .catch(() => {});
  }, []);


  const [pingByHub, setPingByHub] = useState<Record<string, number | null>>({});

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const {
    showHubAdmin,
    setShowHubAdmin,
    hubAdminTab,
    setHubAdminTab,
    myRoles,
    setMyRoles,
    myApprovalStatus,
    setMyApprovalStatus,
    adminHubName,
    setAdminHubName,
    adminHubDescription,
    setAdminHubDescription,
    adminHubIcon,
    setAdminHubIcon,
    adminWelcomeLabel,
    setAdminWelcomeLabel,
    adminWelcomeInviteUrl,
    setAdminWelcomeInviteUrl,
    adminMembers,
    adminBans,
    adminInvites,
    requireApproval,
    setRequireApproval,
    minSecurityLevel,
    setMinSecurityLevel,
    maxChannelDepth,
    setMaxChannelDepth,
    hubTimezone,
    setHubTimezone,
    birthdaysEnabled,
    setBirthdaysEnabled,
    pendingMembers,
    hubListed,
    onHubListedChange,
    isAdmin,
    openHubAdmin,
    openHubAdminInvites,
    handleSaveHubBranding,
    refreshPending,
    handleApproveMember,
    refreshMembers,
    handleKickMember,
    handleBanMember,
    handleMuteMember,
    handleTimeoutMember,
    refreshBans,
    handleUnban,
    refreshInvites,
    handleCreateInvite,
    handleRevokeInvite,
    loadAdminTabData,
  } = useHubAdmin({
    activeHubId,
    hubs,
    setHubs: (updater) => setHubs(updater),
    setError,
    setToast,
  });

  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const [voicePoliteAnnouncement, setVoicePoliteAnnouncement] = useState("");
  const voiceAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVoiceAnnouncementsRef = useRef<string[]>([]);

  const activeHubIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeHubIdRef.current = activeHubId;
  }, [activeHubId]);

  const publicKeyRef = useRef<string | null>(null);
  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);

  const hasActiveHub = hubs.length > 0 && activeHubId !== null;

  // Keep channels in a ref so the WS event handler can check visibility
  // without capturing stale state. Used as the permission gate: messages for
  // channel_ids absent from this list are silently dropped.
  const channelsRef = useRef<Channel[]>([]);

  // Per-channel first-notifying message ID. Set when a message first causes a
  // pin (unread dot) to appear; cleared when the user reaches the bottom of
  // the channel. Drives the "Jump to first notification" affordance.
  const [firstNotifyId, setFirstNotifyId] = useState<
    Record<string, Record<string, string>>
  >({});

  function setFirstNotify(hubId: string, channelId: string, messageId: string) {
    setFirstNotifyId((prev) => {
      const hubMap = prev[hubId] ?? {};
      if (hubMap[channelId]) return prev; // already tracking one; keep the earliest
      return { ...prev, [hubId]: { ...hubMap, [channelId]: messageId } };
    });
  }

  function clearFirstNotify(hubId: string, channelId: string) {
    setFirstNotifyId((prev) => {
      const hubMap = prev[hubId];
      if (!hubMap?.[channelId]) return prev;
      const { [channelId]: _, ...rest } = hubMap;
      return { ...prev, [hubId]: rest };
    });
  }

  function clearHubFirstNotify(hubId: string) {
    setFirstNotifyId((prev) => {
      if (!prev[hubId] || Object.keys(prev[hubId]).length === 0) return prev;
      return { ...prev, [hubId]: {} };
    });
  }

  // Chat state
  const [channels, setChannels] = useState<Channel[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  // Refs kept in App so useTypingIndicators and useChannelMessages can share them.
  const selectedChannelForTypingRef = useRef<Channel | null>(null);
  const selectedConversationForTypingRef = useRef<Conversation | null>(null);

  const {
    typingByKey,
    dmTypingByKey,
    pingTyping,
    pingDmTyping,
    setTypingEntry,
    clearTypingEntry,
    setDmTypingEntry,
    clearDmTypingEntry,
    clearAllTyping,
    clearAllDmTyping,
  } = useTypingIndicators(selectedChannelForTypingRef, selectedConversationForTypingRef);

  // Stable getter refs for useDms — avoids capturing stale closures.
  const inputTextRef = useRef("");
  const pendingAttachmentsRef = useRef<Attachment[]>([]);
  const clearInputRef = useRef<() => void>(() => {});
  const clearPendingAttachmentsRef = useRef<() => void>(() => {});

  // Refs that useChannelMessages needs, declared here so they exist before both
  // useDms and useChannelMessages are called.
  const myDisplayNameRef = useRef<string | null>(null);
  const selectedChannelIdRef = useRef<string | null>(null);

  const {
    view,
    setView,
    viewRef,
    conversations,
    setConversations,
    conversationsRef,
    selectedConversation,
    setSelectedConversation,
    selectedConversationIdRef,
    dmMessages,
    unreadDms,
    setUnreadDms,
    encryptionWarning,
    setEncryptionWarning,
    loadConversations,
    selectConversation,
    startDmWith,
    handleSendDm,
    onDmEvent,
    onDmMemberChanged,
  } = useDms({
    publicKeyRef,
    activeHubIdRef,
    selectedConversationForTypingRef,
    getActiveHub: () => hubs.find((h) => h.is_active),
    getPendingAttachments: () => pendingAttachmentsRef.current,
    getInputText: () => inputTextRef.current,
    clearInput: () => clearInputRef.current(),
    clearPendingAttachments: () => clearPendingAttachmentsRef.current(),
    setError,
    clearAllDmTyping,
  });

  // Ctrl+K quick-switcher palette.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const channelMessages = useChannelMessages({
    activeHubIdRef,
    publicKeyRef,
    myDisplayNameRef,
    channelsRef,
    hubsRef,
    selectedChannelIdRef,
    myPresenceRef,
    effectiveNotifyMode,
    bumpUnread,
    clearUnread,
    setFirstNotify,
    clearFirstNotify,
    clearAllTyping,
    setError,
    setToast,
  });

  // Keep refs in sync so useTypingIndicators sees the current channel/conv.
  useEffect(() => {
    selectedChannelForTypingRef.current = channelMessages.selectedChannel;
  }, [channelMessages.selectedChannel]);

  // Keep stable getter refs in sync for useDms.
  useEffect(() => { inputTextRef.current = channelMessages.inputText; }, [channelMessages.inputText]);
  useEffect(() => { pendingAttachmentsRef.current = channelMessages.pendingAttachments; }, [channelMessages.pendingAttachments]);
  useEffect(() => { clearInputRef.current = () => channelMessages.setInputText(""); }, [channelMessages.setInputText]);
  useEffect(() => { clearPendingAttachmentsRef.current = () => channelMessages.setPendingAttachments([]); }, [channelMessages.setPendingAttachments]);

  // Keep selectedChannelIdRef in sync (used by WS handlers).
  useEffect(() => {
    selectedChannelIdRef.current = channelMessages.selectedChannel?.id ?? null;
  }, [channelMessages.selectedChannel]);

  // Whether the right-side member list is collapsed. Local-only preference;
  // localStorage is fine since it's purely cosmetic + per-device.
  const [memberSidebarHidden, setMemberSidebarHiddenState] = useState<boolean>(
    () => {
      try {
        return localStorage.getItem("wavvon.memberSidebarHidden") === "1";
      } catch {
        return false;
      }
    },
  );
  function setMemberSidebarHidden(v: boolean) {
    setMemberSidebarHiddenState(v);
    try {
      localStorage.setItem("wavvon.memberSidebarHidden", v ? "1" : "0");
    } catch {}
  }

  // Lightbox: when set, renders a full-screen image overlay. Used by image
  // attachments so clicking opens a zoom view instead of a new browser tab.
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const openImage = (src: string, alt: string) => setLightbox({ src, alt });

  // Right-click on a user: small popover with quick actions.
  const [userContextMenu, setUserContextMenu] = useState<{
    x: number;
    y: number;
    user: User;
  } | null>(null);

  async function handleHubReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = hubs.findIndex((h) => h.hub_id === active.id);
    const newIndex = hubs.findIndex((h) => h.hub_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(hubs, oldIndex, newIndex);
    setHubs(reordered);
    try {
      await invoke("reorder_hubs", {
        hubIds: reordered.map((h) => h.hub_id),
      });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleReconnect() {
    if (!activeHubId) return;
    // Manual click is a fresh start: cancel any pending auto-retry and
    // reset backoff so a subsequent failure starts at 1s again.
    clearReconnectTimer(activeHubId);
    resetAttempts(activeHubId);
    setReconnecting(activeHubId, true);
    try {
      await invoke("reconnect_hub", { hubId: activeHubId });
      // The hub-ws-status:true event will flip hubConnected and clear
      // the banner; if reconnect succeeded but the event hasn't arrived
      // yet, the banner still shows briefly -- that's fine.
    } catch (e) {
      setError(String(e));
      setReconnecting(activeHubId, false);
      // Hand control back to the auto-reconnect loop after the manual
      // attempt fails, so we keep trying in the background.
      scheduleReconnect(activeHubId);
    }
  }

  async function handleUserDm(u: User) {
    setUserContextMenu(null);
    if (u.public_key === publicKey) return;
    try {
      const conv = await invoke<Conversation>("create_conversation", {
        members: [u.public_key],
        memberHubs: {},
      });
      const list = await invoke<Conversation[]>("list_conversations");
      setConversations(list);
      setView("dms");
      selectConversation(conv);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUserAddFriend(u: User) {
    setUserContextMenu(null);
    await handleUserAddFriendFromHook(
      u.public_key,
      publicKey,
      u.display_name || formatPubkey(u.public_key),
    );
  }


  const {
    userAlliances,
    setUserAlliances,
    allianceChannels,
    setAllianceChannels,
    loadAlliances,
  } = useAlliances(setError);

  // Create channel dialog
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelParentId, setNewChannelParentId] = useState<string | null>(null);
  const [createChannelLoading, setCreateChannelLoading] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);

  // Edit description dialog
  const [editDescriptionChannel, setEditDescriptionChannel] = useState<Channel | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState("");

  const [appearanceChannel, setAppearanceChannel] = useState<Channel | null>(null);
  const [channelSettingsModal, setChannelSettingsModal] = useState<Channel | null>(null);
  const [channelSettingsSaving, setChannelSettingsSaving] = useState(false);
  const [channelSettingsDeleting, setChannelSettingsDeleting] = useState(false);
  const [channelSettingsError, setChannelSettingsError] = useState<string | null>(null);
  const [bannerEditChannel, setBannerEditChannel] = useState<Channel | null>(null);

  const [hubDropdownOpen, setHubDropdownOpen] = useState(false);
  const [showHubStreams, setShowHubStreams] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null);

  // Message edit state — which message id is being edited and its draft
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  // Hub users
  const [users, setUsers] = useState<User[]>([]);

  // Slash command autocomplete entries — populated after hub load.
  interface SlashCommandEntry {
    command: string;
    description: string;
    bot_name: string;
  }
  const [slashCommands, setSlashCommands] = useState<SlashCommandEntry[]>([]);

  const [activeBotApps, setActiveBotApps] = useState<Map<string, BotAppLaunchEvent>>(new Map());

  function sendBotAppJoin(botId: string, channelId: string) {
    if (!activeHubId) return;
    invoke("send_hub_ws_raw", {
      payload: JSON.stringify({ type: "bot_app_join", bot_id: botId, channel_id: channelId }),
    }).catch(() => {});
  }

  const pubkeyToName = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const u of users) m[u.public_key] = u.display_name;
    return m;
  }, [users]);

  // Indexes for mention rendering. knownDisplayNames is the lower-cased set
  // of all display names on this hub so MessageContent can decide which
  // @tokens are real mentions vs just text.
  const knownDisplayNames = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) {
      if (u.display_name) s.add(u.display_name.toLowerCase());
    }
    return s;
  }, [users]);
  const myDisplayName = useMemo(
    () => users.find((u) => u.public_key === publicKey)?.display_name ?? null,
    [users, publicKey]
  );
  useEffect(() => {
    myDisplayNameRef.current = myDisplayName;
  }, [myDisplayName]);

  const voice = useVoice({ activeHubId, selectedChannel: channelMessages.selectedChannel, setError, setToast });

  // Registered so switchAccountGuarded can refuse a mid-voice account switch
  // at the source (defense in depth alongside a disabled Switch button in
  // Settings → Account) — switching while joined to a voice channel is
  // blocked outright, not auto-left on the caller's behalf (mirrors web's
  // App.tsx switch guard, decisions.md "Account switching is an in-place
  // key-remount, guarded, not a reload").
  useEffect(() => {
    setSwitchGuard(() => (voice.voiceChannelId ? "Leave the voice channel before switching accounts." : null));
    return () => setSwitchGuard(null);
  }, [voice.voiceChannelId]);

  const video = useVideo({
    activeHubId,
    voiceChannelId: voice.voiceChannelId,
    publicKey,
    voiceSpeakingPubkeys: voice.speakingPubkeys,
  });

  const whisper = useWhisper({ activeHubId, voiceChannelId: voice.voiceChannelId });
  const soundboard = useSoundboard(voice.voiceChannelId);
  const [showWhisperPanel, setShowWhisperPanel] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);

  // === Voice move (events.md §7.1/§7.2) ===
  const [voiceMoveMenu, setVoiceMoveMenu] = useState<{
    pubkey: string;
    displayName: string;
    position: { x: number; y: number };
    currentChannelId: string;
  } | null>(null);
  // Overrides the sidebar's local-channel-list name lookup for the voice HUD
  // label — set from a voice_move push's target_channel_name, since that
  // destination may not be in the local channel list (events.md §7.1/§7.4).
  const [voiceChannelNameHint, setVoiceChannelNameHint] = useState<string | null>(null);
  const [voiceMovePrompt, setVoiceMovePrompt] = useState<{
    targetChannelId: string;
    targetChannelName: string;
  } | null>(null);
  const [voiceMoveToast, setVoiceMoveToast] = useState<{
    channelName: string;
    sourceChannelId: string | null;
  } | null>(null);
  const voiceMoveToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canMoveMembers = isAdmin || myRoles.some((r) => r.permissions?.includes("move_members"));
  const canCreateInvites = isAdmin || myRoles.some((r) => r.permissions?.includes("manage_channels"));
  const voiceMoveChannelOptions = useMemo(
    () => moveChannelOptions(channels).filter((c) => c.id !== voiceMoveMenu?.currentChannelId),
    [channels, voiceMoveMenu],
  );

  // Mover's side: right-click "Move to channel…" (events.md §7.1).
  function handleMoveMember(targetPubkey: string, targetChannelId: string, eventId?: string) {
    invoke("send_hub_ws_raw", {
      payload: JSON.stringify({
        type: "voice_move",
        target_pubkey: targetPubkey,
        target_channel_id: targetChannelId,
        ...(eventId ? { event_id: eventId } : {}),
      }),
    }).catch(() => setToast("Not connected"));
  }

  function showVoiceMoveToast(channelName: string, sourceChannelId: string | null) {
    if (voiceMoveToastTimerRef.current) clearTimeout(voiceMoveToastTimerRef.current);
    setVoiceMoveToast({ channelName, sourceChannelId });
    voiceMoveToastTimerRef.current = setTimeout(() => setVoiceMoveToast(null), 8000);
  }

  function handleRejoinPreviousVoiceChannel() {
    const sourceChannelId = voiceMoveToast?.sourceChannelId;
    setVoiceMoveToast(null);
    if (voiceMoveToastTimerRef.current) { clearTimeout(voiceMoveToastTimerRef.current); voiceMoveToastTimerRef.current = null; }
    if (!sourceChannelId) return;
    void voice.handleVoiceJoin(sourceChannelId);
  }

  function handleAcceptVoiceMove() {
    if (!voiceMovePrompt) return;
    const { targetChannelId, targetChannelName } = voiceMovePrompt;
    setVoiceMovePrompt(null);
    setVoiceChannelNameHint(targetChannelName);
    void voice.handleVoiceJoin(targetChannelId);
  }

  // Decline is a server no-op (events.md §7.2) — closing the prompt is the
  // entire client side of it, nothing to send.
  function handleDeclineVoiceMove() {
    setVoiceMovePrompt(null);
  }

  function handleVoiceMovePush(raw: unknown) {
    const decision = decideVoiceMove(raw as Parameters<typeof decideVoiceMove>[0]);
    if (decision.kind === "ignore") return;
    if (decision.kind === "auto") {
      setVoiceChannelNameHint(decision.targetChannelName);
      void voice.handleVoiceJoin(decision.targetChannelId);
      showVoiceMoveToast(decision.targetChannelName, decision.sourceChannelId);
    } else {
      setVoiceMovePrompt({ targetChannelId: decision.targetChannelId, targetChannelName: decision.targetChannelName });
    }
  }

  function buildTiles(
    remoteStreams: Map<string, MediaStream>,
    videoPubkeys: Set<string>,
    tileUsers: User[],
    tileSpeak: Set<string>,
    pinnedPubkey: string | null,
  ) {
    const tiles: {
      pubkey: string;
      displayName: string;
      stream: MediaStream;
      speaking: boolean;
      pinned: boolean;
    }[] = [];
    for (const [pk, stream] of remoteStreams) {
      if (!videoPubkeys.has(pk)) continue;
      const u = tileUsers.find((x) => x.public_key === pk);
      tiles.push({
        pubkey: pk,
        displayName: u?.display_name ?? pk.slice(0, 8),
        stream,
        speaking: tileSpeak.has(pk),
        pinned: pinnedPubkey === pk,
      });
    }
    tiles.sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
        (b.speaking ? 1 : 0) - (a.speaking ? 1 : 0),
    );
    return tiles;
  }

  // Farm admin state
  const [showFarmSettings, setShowFarmSettings] = useState(false);
  const [farmAdminTab, setFarmAdminTab] = useState<FarmAdminTab>("general");
  const [farmAdminUrl, setFarmAdminUrl] = useState<string>("");
  const [isFarmAdmin, setIsFarmAdmin] = useState(false);
  const [showCreateHub, setShowCreateHub] = useState(false);
  const [knownFarms, setKnownFarms] = useState<{ url: string; name: string }[]>([]);

  const {
    showSettings,
    setShowSettings,
    settingsTab,
    setSettingsTab,
    theme,
    setTheme,
    skin,
    setSkin,
    recoveryPhrase,
    setRecoveryPhrase,
    handleSetTheme,
    handleSkinChange,
    handleShowRecovery,
    handleClearLocalData,
    handleRecoverIdentity,
  } = useSettingsProfile({
    setPublicKey,
    setError,
    setToast,
  });

  const [showDiscover, setShowDiscover] = useState(false);
  const [showHubBrowser, setShowHubBrowser] = useState(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try {
      return localStorage.getItem("wavvon.seenWelcome") !== "1";
    } catch {
      return true;
    }
  });

  const {
    showFriends,
    setShowFriends,
    openFriends,
    handleUserAddFriend: handleUserAddFriendFromHook,
  } = useFriends({ setError, setToast });

  const [hideSilenced, setHideSilenced] = useState(false);
  const [hideBirthdays, setHideBirthdays] = useState(false);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);



  useEffect(() => {
    if (voice.shareError) setToast(voice.shareError);
  }, [voice.shareError]);

  // ESC closes the settings view (and stops the mic test if one is running)
  useEffect(() => {
    if (!showSettings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings, voice.micTesting]);

  // ESC closes the hub admin view
  useEffect(() => {
    if (!showHubAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHubAdmin(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHubAdmin]);

  useEffect(() => {
    if (!showHubAdmin) return;
    loadAdminTabData(hubAdminTab, voice.refreshVoiceMutes);
  }, [showHubAdmin, hubAdminTab]);

  // Surface any error as a toast so the user actually sees it
  // (we removed the always-visible connect screen that used to render it).
  useEffect(() => {
    if (error) setToast(error);
  }, [error]);

  useWsHandlers({
    activeHubIdRef,
    publicKeyRef,
    selectedChannelIdRef,
    selectedConversationIdRef,
    users,
    setUsers,
    myPresenceRef,
    setHubConnected,
    setAssertiveAnnouncement,
    setToast,
    setTypingEntry,
    clearTypingEntry,
    setDmTypingEntry,
    clearDmTypingEntry,
    onDmEvent,
    onDmMemberChanged,
    onHubReconnected,
    scheduleReconnect,
    cancelAllReconnectTimers,
    onVoiceJoined: voice.onVoiceJoined,
    onParticipantJoined: voice.onParticipantJoined,
    onParticipantLeft: voice.onParticipantLeft,
    onMicLevel: voice.onMicLevel,
    onHubErrorVoiceJoin: voice.onHubErrorVoiceJoin,
    pendingVoiceAnnouncementsRef,
    voiceAnnounceTimerRef,
    setVoicePoliteAnnouncement,
    hubs,
    channelsRef,
    onBotAppLaunch: (ev: BotAppLaunchEvent) => {
      setActiveBotApps((prev) => {
        const next = new Map(prev);
        next.set(ev.bot_id, ev);
        return next;
      });
    },
    onBotAppOpen: (ev: BotAppOpenEvent, hubUrl: string) => {
      const label = `mini-app-${ev.bot_id}`;
      invoke("open_mini_app", {
        label,
        url: ev.mini_app_url,
        hubUrl,
        token: ev.session_token,
        channelId: ev.channel_id,
        botId: ev.bot_id,
        requiresCamera: ev.requires_camera,
      }).catch(() => {});
    },
    onBotAppClose: (ev: BotAppCloseEvent) => {
      setActiveBotApps((prev) => {
        const next = new Map(prev);
        next.delete(ev.bot_id);
        return next;
      });
      invoke("close_mini_app", { label: `mini-app-${ev.bot_id}` }).catch(() => {});
    },
    onVoiceMove: handleVoiceMovePush,
  });

  async function loadHubData() {
    try {
      const activeHub = hubs.find((h) => h.hub_id === activeHubId) ?? hubs.find((h) => h.is_active);

      // Check lobby scope first — if we're in the lobby, skip loading full hub data.
      if (activeHub) {
        try {
          const lobbyStatus = await invoke<LobbyStatus>("lobby_status", { hubUrl: activeHub.hub_url });
          if (lobbyStatus.status === "lobby") {
            setHubScope((prev) => ({ ...prev, [activeHub.hub_id]: "lobby" }));
            return;
          } else {
            setHubScope((prev) => {
              if (prev[activeHub.hub_id] === "lobby") {
                return { ...prev, [activeHub.hub_id]: "member" };
              }
              return prev;
            });
          }
        } catch {
          // lobby endpoint absent means not a lobby hub; continue normally
        }
      }

      // Pull /me FIRST. If we're pending approval, the rest of the calls
      // would just 403 and bury the user under a wall of error toasts.
      let me: MeInfo | null = null;
      try {
        me = await invoke<MeInfo>("get_me");
        setMyRoles(me.roles);
        setMyApprovalStatus(me.approval_status);
      } catch {
        setMyRoles([]);
        setMyApprovalStatus("unknown");
      }

      if (me?.approval_status === "pending") {
        // Reset everything else; show the landing screen.
        setChannels([]);
        setUsers([]);
        setConversations([]);
        channelMessages.setSelectedAllianceChannel(null);
        channelMessages.setMessages([]);
        setUserAlliances([]);
        setAllianceChannels({});
        return;
      }

      invoke<{ timezone?: string | null }>("get_hub_branding")
        .then((b) => setActiveHubTimezone(b.timezone ?? null))
        .catch(() => setActiveHubTimezone(null));

      const ch = await invoke<Channel[]>("list_channels");
      setChannels(ch);
      const u = await invoke<User[]>("list_users");
      setUsers(u);
      const c = await invoke<Conversation[]>("list_conversations");
      setConversations(c);
      // Reset selection when switching hub
      channelMessages.setSelectedAllianceChannel(null);
      channelMessages.setAllianceMessages([]);
      channelMessages.setMessages([]);
      await loadAlliances();
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadSlashCommands(hubUrl: string) {
    try {
      const bots = await invoke<BotAdminInfo[]>("admin_list_bots", { hubUrl });
      const entries: SlashCommandEntry[] = [];
      for (const bot of bots) {
        try {
          const detail = await invoke<BotDetailInfo>("admin_get_bot_detail", { hubUrl, pubkey: bot.public_key });
          for (const cmd of detail.commands) {
            entries.push({ command: cmd.command, description: cmd.description, bot_name: bot.display_name });
          }
        } catch {
          // skip bots whose detail fails to load
        }
      }
      setSlashCommands(entries);
    } catch {
      setSlashCommands([]);
    }
  }

  async function handleSetTalkPower(channelId: string) {
    let current = 0;
    try {
      const tp = await invoke<{ min_talk_power: number }>("get_talk_power", {
        channelId,
      });
      current = tp.min_talk_power;
    } catch {
      // Falling back to 0 is fine — user just sees the default.
    }
    const value = prompt(
      "Minimum talk power (priority) to speak in this channel.\nUse 0 to allow anyone.",
      String(current)
    );
    if (value === null) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Invalid talk power");
      return;
    }
    try {
      await invoke("set_talk_power_cmd", {
        channelId,
        minTalkPower: Math.floor(n),
      });
      setToast(n === 0 ? "Talk power cleared" : `Talk power set to ${Math.floor(n)}`);
    } catch (e) {
      setError(String(e));
    }
  }

  function handleHubUrlChange(v: string) {
    setHubUrl(v);
    const parsed = parseHubInput(v);
    if (parsed?.inviteCode) setInviteCode(parsed.inviteCode);
  }

  // On mount: check whether the app was launched via a wavvon:// deep link,
  // and listen for deep links opened while the app is already running.
  useEffect(() => {
    invoke<string | null>("get_pending_deep_link").then((url) => {
      if (!url) return;
      const parsed = parseHubInput(url);
      if (parsed) {
        setHubUrl(parsed.hubUrl);
        setInviteCode(parsed.inviteCode);
        setShowAddHub(true);
      }
    });
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    listen<string>("join-hub-requested", (event) => {
      const parsed = parseHubInput(event.payload);
      if (parsed) {
        setHubUrl(parsed.hubUrl);
        setInviteCode(parsed.inviteCode);
        setShowAddHub(true);
      }
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlistenFn = fn;
    });
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    listen<{ version: string; notes: string | null }>("update-available", (ev) => {
      setUpdateInfo(ev.payload);
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlistenFn = fn;
    });
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  // Debounced fetch of /info while the user types a hub URL.
  useEffect(() => {
    if (!showAddHub && !showWelcome) {
      setHubPreview({ state: "idle" });
      return;
    }
    const parsed = parseHubInput(hubUrl);
    if (!parsed) {
      setHubPreview({ state: "idle" });
      return;
    }
    const resolvedUrl = parsed.hubUrl;
    let cancelled = false;
    setHubPreview({ state: "loading" });
    const handle = setTimeout(async () => {
      try {
        const info = await invoke<{
          name: string;
          description?: string | null;
          icon?: string | null;
          invite_only?: boolean;
          min_security_level?: number;
          challenge_mode?: string | null;
        }>("preview_hub_info", { url: resolvedUrl });
        if (!cancelled) {
          setHubPreview({
            state: "ok",
            url: resolvedUrl,
            name: info.name,
            description: info.description,
            icon: info.icon,
            invite_only: info.invite_only,
            min_security_level: info.min_security_level,
            challenge_mode: info.challenge_mode,
          });
        }
      } catch (e) {
        if (!cancelled) setHubPreview({ state: "error", message: String(e) });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [hubUrl, showAddHub, showWelcome]);

  async function handleAddHub(challengeToken?: string) {
    setLoading(true);
    setError(null);
    try {
      const resolvedUrl = parseHubInput(hubUrl)?.hubUrl ?? hubUrl;

      if (!challengeToken && hubPreview.state === "ok" && hubPreview.challenge_mode && hubPreview.challenge_mode !== "off") {
        if (!publicKey) {
          setError("Identity not loaded yet. Try again in a moment.");
          return;
        }
        setBotChallenge({ hubUrl: resolvedUrl, pubkey: publicKey, resolvedUrl });
        return;
      }

      const hub = await invoke<Hub>("add_hub", {
        hubUrl: resolvedUrl,
        inviteCode: inviteCode.trim() || null,
        challengeToken: challengeToken ?? null,
      });
      const allHubs = await invoke<Hub[]>("list_hubs");
      setHubs(allHubs);
      if (!publicKey) {
        try {
          const key = await invoke<string>("get_my_public_key");
          setPublicKey(key);
        } catch {}
      }
      if (!activeHubId) setActiveHubId(hub.hub_id);
      setShowAddHub(false);
      setHubUrl("");
      setInviteCode("");
      setBotChallenge(null);

      try {
        const status = await invoke<LobbyStatus>("lobby_status", { hubUrl: resolvedUrl });
        if (status.status === "lobby") {
          setHubScope((prev) => ({ ...prev, [hub.hub_id]: "lobby" }));
        } else {
          const survey = await invoke<{ id: string } | null>("survey_current", { hubUrl: resolvedUrl });
          if (survey) {
            setPendingSurveyHubId(hub.hub_id);
          }
        }
      } catch {
        // lobby/survey check is best-effort
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchHub(hubId: string) {
    if (hubId === activeHubId) return;
    try {
      await invoke("set_active_hub", { hubId });
      setActiveHubId(hubId);
      setHubs((prev) =>
        prev.map((h) => ({ ...h, is_active: h.hub_id === hubId }))
      );
      // Leave per-channel unread alone -- it'll clear when the user
      // actually opens the relevant channel.
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveHub(hubId: string) {
    const hub = hubs.find((h) => h.hub_id === hubId);
    const name = hub?.hub_name ?? "this hub";
    if (!confirm(`Leave "${name}"?`)) return;
    try {
      await invoke("remove_hub", { hubId });
      const remaining = await invoke<Hub[]>("list_hubs");
      setHubs(remaining);
      if (activeHubId === hubId) {
        setActiveHubId(remaining[0]?.hub_id ?? null);
      }
      clearHubUnread(hubId);
      onHubRemovedReconnect(hubId);
    } catch (e) {
      setError(String(e));
    }
  }

  // Auto-connect saved hubs on app start + load our own public key once
  useEffect(() => {
    (async () => {
      // Apply persisted theme/skin as early as possible to avoid a flash.
      try {
        const appearance = await invoke<{ slot: string; skin?: WavvonSkin | null }>("load_appearance");
        if (appearance.slot === "custom" && appearance.skin) {
          const s = appearance.skin;
          setSkin(s);
          setTheme("custom");
          document.documentElement.dataset.theme = s.base;
          applySkinTokens(s);
        } else {
          const valid =
            appearance.slot === "calm" || appearance.slot === "classic" ||
            appearance.slot === "linear" || appearance.slot === "light"
              ? (appearance.slot as ThemeId)
              : "calm";
          setTheme(valid);
          document.documentElement.dataset.theme = valid;
        }
      } catch {
        try {
          const profile = await invoke<{ theme?: string | null }>("get_profile");
          const t = (profile.theme ?? "calm") as ThemeId;
          const valid = t === "calm" || t === "classic" || t === "linear" || t === "light" ? t : "calm";
          setTheme(valid);
          document.documentElement.dataset.theme = valid;
        } catch {
          document.documentElement.dataset.theme = "calm";
        }
      }
      try {
        const key = await invoke<string>("get_my_public_key");
        setPublicKey(key);
      } catch (e) {
        console.error("Failed to load identity:", e);
      }
      // Ask for notification permission once on launch. The browser
      // Notification API works inside Tauri 2 webviews; we silently fall
      // back to no notifications if the user denies.
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        try {
          await Notification.requestPermission();
        } catch {}
      }
      try {
        const allHubs = await invoke<Hub[]>("auto_connect_saved");
        if (allHubs.length > 0) {
          setHubs(allHubs);
          const active = allHubs.find((h) => h.is_active) ?? allHubs[0];
          setActiveHubId(active.hub_id);
          setShowWelcome(false);
        }
      } catch (e) {
        console.error("Auto-connect failed:", e);
      }
      invoke("publish_dh_key").catch((e) =>
        console.warn("Failed to publish DH key:", e)
      );
    })();
  }, []);

  // After hubs load and publicKey is known, check whether any connected hub
  // is backed by a farm and whether the local user is its admin.
  useEffect(() => {
    if (!publicKey || hubs.length === 0) return;
    async function checkFarmAdmin() {
      const farms: { url: string; name: string }[] = [];
      for (const hub of hubs) {
        try {
          const info = await invoke<{
            farm_url?: string | null;
          }>("get_hub_info", { hubUrl: hub.hub_url });
          if (!info.farm_url) continue;
          const farmUrl = info.farm_url;
          const farmInfo = await invoke<{
            admin_pubkey?: string;
            name?: string;
          }>("get_farm_info", { farmUrl });
          const name = farmInfo.name ?? farmUrl;
          if (!farms.some((f) => f.url === farmUrl)) {
            farms.push({ url: farmUrl, name });
          }
          if (farmInfo.admin_pubkey && farmInfo.admin_pubkey === publicKey) {
            setIsFarmAdmin(true);
            setFarmAdminUrl(farmUrl);
          }
        } catch {
          // Not a farmed hub or farm unreachable — skip.
        }
      }
      setKnownFarms(farms);
    }
    void checkFarmAdmin();
  }, [publicKey, hubs.length]);

  useEffect(() => {
    if (hubs.length > 0) setShowWelcome(false);
  }, [hubs.length]);

  // Suppress the webview's default right-click menu (Reload / Inspect /
  // Back). Tauri 2 still enables it by default and a stray right-click
  // anywhere on the chrome would let the user accidentally reload the app.
  // Components that want their own context menu (channel rows, messages,
  // user list items) call e.preventDefault() in their onContextMenu, which
  // also stops the browser default — so they keep working unchanged.
  // Native menus stay available inside text inputs so copy/paste isn't
  // broken.
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest("[data-allow-context-menu]")
      ) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);

  // Auto-select the first text-channel-style room when a hub loads, so
  // the user lands on something readable instead of an empty content
  // pane. Only fires when nothing's selected; user-driven channel
  // changes don't re-trigger because selectedChannel is set.
  useEffect(() => {
    if (channelMessages.selectedChannel) return;
    if (channels.length === 0) return;
    // Skip categories and banner channels — pick the first interactive leaf.
    const firstLeaf = channels.find((c) => !c.is_category && c.channel_type !== "banner");
    if (firstLeaf) {
      channelMessages.selectChannel(firstLeaf);
    }
    // selectChannel is stable in scope but eslint can't prove that;
    // listing it would re-trigger every render. Channels is the real
    // signal we want to watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, channelMessages.selectedChannel]);

  // Reload data when switching hubs
  useEffect(() => {
    if (activeHubId) {
      loadHubData();
      const hub = hubs.find((h) => h.hub_id === activeHubId);
      if (hub) loadSlashCommands(hub.hub_url);
      else setSlashCommands([]);
    } else {
      // No active hub — clear approval state so the next switch starts fresh.
      setMyApprovalStatus("unknown");
      setSlashCommands([]);
    }
  }, [activeHubId]);

  // Refresh users every 10 seconds for active hub
  useEffect(() => {
    if (!hasActiveHub) return;
    const interval = setInterval(async () => {
      try {
        const u = await invoke<User[]>("list_users");
        setUsers(u);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [hasActiveHub, activeHubId]);

  // Ping every connected hub every 15s so the sidebar shows current latency
  useEffect(() => {
    if (hubs.length === 0) return;
    let cancelled = false;
    async function tick() {
      for (const h of hubs) {
        try {
          const ms = await invoke<number>("ping_hub", { hubId: h.hub_id });
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: ms }));
        } catch {
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: null }));
        }
      }
    }
    tick();
    const interval = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hubs]);

  async function startDmWithAndClose(targetKey: string, targetHubUrl?: string | null) {
    await startDmWith(targetKey, targetHubUrl);
    setShowFriends(false);
  }

  async function openSettings() {
    setShowSettings(true);
    setRecoveryPhrase(null);
    try {
      const profile = await invoke<{ theme?: string | null }>("get_profile");
      const t = profile.theme;
      if (t === "calm" || t === "classic" || t === "linear" || t === "light") {
        setTheme(t);
      }
    } catch {}

    await voice.loadVoiceSettings();
  }

  function handleDiscoverJoin(url: string, code: string) {
    setHubUrl(url);
    setInviteCode(code);
    setShowAddHub(true);
    setShowDiscover(false);
  }

  async function closeSettings() {
    if (voice.micTesting) await voice.toggleMicTest();
    setShowSettings(false);
  }

  function dismissWelcome() {
    try {
      localStorage.setItem("wavvon.seenWelcome", "1");
    } catch {}
    setShowWelcome(false);
  }


  async function handleRenameChannel(channel: Channel) {
    const next = prompt("Rename channel", channel.name);
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === channel.name) return;
    try {
      await invoke("rename_channel", { channelId: channel.id, name: trimmed });
      setChannels((prev) => prev.map((c) => c.id === channel.id ? { ...c, name: trimmed } : c));
      const sel = channelMessages.selectedChannel;
      if (sel?.id === channel.id) {
        channelMessages.selectChannel({ ...sel, name: trimmed });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  const channelTree = useMemo(() => {
    return buildChannelTree(channels);
  }, [channels]);

  const silencedChannelIds = useMemo(() => {
    if (!activeHubId || !hideSilenced) return new Set<string>();
    return new Set(
      channels
        .filter((c) => !c.is_category && effectiveNotifyMode(activeHubId, c.id) === "silent")
        .map((c) => c.id)
    );
  }, [activeHubId, hideSilenced, channels, channelNotifyMode, hubNotifyMode]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Client-side cycle guard: can't drop a node into its own descendant.
    const forbidden = descendantIds(channelTree, activeId);
    if (forbidden.has(overId)) return;

    // Determine the new parent: dropping ON a category = nest inside it;
    // dropping next to anything else = become a sibling of that item.
    const allFlat = flattenTree(channelTree);
    const activeFlat = allFlat.find((n) => n.node.id === activeId);
    const overFlat = allFlat.find((n) => n.node.id === overId);
    if (!activeFlat || !overFlat) return;

    if (maxChannelDepth > 0) {
      const maxCodeDepth = maxChannelDepth - 1;
      const parentForDepth = overFlat.node.is_category ? overFlat.node.id : overFlat.parentId;
      const newDepth = parentForDepth !== null
        ? computeDepth(channels, parentForDepth) + 1
        : 0;
      if (newDepth > maxCodeDepth) return;
      if (activeFlat.node.is_category && newDepth >= maxCodeDepth) return;
    }

    const newParentId = overFlat.node.is_category ? overFlat.node.id : overFlat.parentId;
    const parentChanged = newParentId !== activeFlat.node.parent_id;

    // Optimistic parent update so the reorder below sees the new shape.
    const channelsWithNewParent = parentChanged
      ? channels.map((c) => (c.id === activeId ? { ...c, parent_id: newParentId } : c))
      : channels;

    // Reorder within the flat global list.
    const sorted = [...channelsWithNewParent].sort((a, b) => a.display_order - b.display_order);
    const oldIndex = sorted.findIndex((c) => c.id === activeId);
    const newIndex = sorted.findIndex((c) => c.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex);
    setChannels(reordered.map((c, i) => ({ ...c, display_order: i })));

    try {
      if (parentChanged) {
        await invoke("move_channel", { channelId: activeId, parentId: newParentId });
      }
      await invoke("reorder_channels", { channelIds: reordered.map((c) => c.id) });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateChannel(
    name: string,
    channelType: string,
    isCategory: boolean,
    description: string,
    spawnerNameTemplate?: string,
    banner?: BannerSource,
  ) {
    setCreateChannelLoading(true);
    setCreateChannelError(null);
    try {
      const channel = await invoke<Channel>("create_channel", {
        name,
        parentId: newChannelParentId,
        isCategory,
        channelType: isCategory ? undefined : channelType,
        description: description ? description : null,
        bannerUrl: channelType === "banner" ? (banner?.url || null) : null,
        spawnerNameTemplate: channelType === "spawner" ? (spawnerNameTemplate ?? null) : null,
      });

      if (channelType === "banner" && banner?.file) {
        const filePath = (banner.file as TauriFile).path;
        if (filePath) {
          const activeHub = hubs.find((h) => h.hub_id === activeHubId);
          if (activeHub) {
            const uploadResult = await invoke<{ file_id: string }>("upload_file", {
              hubUrl: activeHub.hub_url,
              channelId: channel.id,
              filePath,
            });
            if (uploadResult.file_id) {
              await invoke("patch_channel_banner_file", {
                channelId: channel.id,
                bannerFileId: uploadResult.file_id,
              });
              channel.banner_file_id = uploadResult.file_id;
            }
          }
        }
      }

      setChannels((prev) => [...prev, channel]);
      setNewChannelParentId(null);
      setShowCreateChannel(false);
      if (!channel.is_category && channel.channel_type !== "banner") {
        channelMessages.selectChannel(channel);
      }
    } catch (e) {
      setCreateChannelError(String(e));
    } finally {
      setCreateChannelLoading(false);
    }
  }

  function openEditDescription(channel: Channel) {
    setEditDescriptionChannel(channel);
    setEditDescriptionValue(channel.description ?? "");
    setContextMenu(null);
  }

  async function handleSaveDescription() {
    if (!editDescriptionChannel) return;
    const desc = editDescriptionValue.trim();
    try {
      await invoke("update_channel_description", {
        channelId: editDescriptionChannel.id,
        description: desc ? desc : null,
      });
      setChannels((prev) =>
        prev.map((c) =>
          c.id === editDescriptionChannel.id
            ? { ...c, description: desc ? desc : null }
            : c
        )
      );
      const sel = channelMessages.selectedChannel;
      if (sel?.id === editDescriptionChannel.id) {
        channelMessages.selectChannel({ ...sel, description: desc ? desc : null });
      }
      setEditDescriptionChannel(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteChannel(channelId: string) {
    if (!confirm("Delete this channel? Messages will be lost.")) return;
    try {
      await invoke("delete_channel", { channelId });
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (channelMessages.selectedChannel?.id === channelId) {
        channelMessages.clearSelectedChannel();
      }
      setContextMenu(null);
    } catch (e) {
      setError(String(e));
    }
  }

  function handleEditAppearance(channel: Channel) {
    setAppearanceChannel(channel);
  }

  async function handleSaveBannerUrl(channelId: string, bannerUrl: string) {
    try {
      await invoke("patch_channel_banner_url", { channelId, bannerUrl });
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, banner_url: bannerUrl, banner_file_id: null } : c))
      );
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveAppearance(channel: Channel, icon: string | null, color: string | null, customIconSvg: string | null) {
    try {
      await invoke("update_channel_appearance", { channelId: channel.id, icon, color, customIconSvg });
      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, icon, color, custom_icon_svg: customIconSvg } : c))
      );
    } catch (e) {
      setError(String(e));
    }
  }

  // ChannelSettingsModal's onSave — composes the individual PATCH-shaped
  // Tauri commands the settings tab touches. A banner *file* goes through
  // upload_file_bytes (base64 over the IPC boundary — webview Files carry
  // bytes but no filesystem path).
  async function handleSaveChannelSettings(
    name: string,
    description: string,
    color: string | null,
    icon: string | null,
    customIconSvg: string | null,
    banner?: BannerSource,
    forumRequireTag?: boolean,
  ) {
    if (!channelSettingsModal) return;
    const channel = channelSettingsModal;
    setChannelSettingsSaving(true);
    setChannelSettingsError(null);
    try {
      if (forumRequireTag !== undefined && forumRequireTag !== (channel.forum_require_tag ?? false)) {
        await invoke("set_forum_require_tag", { channelId: channel.id, requireTag: forumRequireTag });
      }
      if (name !== channel.name) {
        await invoke("rename_channel", { channelId: channel.id, name });
      }
      if (!channel.is_category && (description || null) !== channel.description) {
        await invoke("update_channel_description", { channelId: channel.id, description: description || null });
      }
      if (
        color !== (channel.color ?? null) ||
        icon !== (channel.icon ?? null) ||
        customIconSvg !== (channel.custom_icon_svg ?? null)
      ) {
        await invoke("update_channel_appearance", { channelId: channel.id, icon, color, customIconSvg });
      }
      const bannerHub = hubs.find((h) => h.hub_id === activeHubId) ?? hubs.find((h) => h.is_active);
      if (banner?.file && bannerHub) {
        const buf = await banner.file.arrayBuffer();
        let bin = "";
        const view = new Uint8Array(buf);
        for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
        const up = await invoke<{ file_id: string }>("upload_file_bytes", {
          hubUrl: bannerHub.hub_url,
          channelId: channel.id,
          filename: banner.file.name,
          mimeType: banner.file.type || "application/octet-stream",
          bytesB64: btoa(bin),
        });
        await invoke("patch_channel_banner_url", { channelId: channel.id, bannerFileId: up.file_id });
      } else if (banner?.url && banner.url !== (channel.banner_url ?? "")) {
        await invoke("patch_channel_banner_url", { channelId: channel.id, bannerUrl: banner.url });
      }
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channel.id
            ? {
                ...c,
                name,
                description: channel.is_category ? c.description : description || null,
                color,
                icon,
                custom_icon_svg: customIconSvg,
                banner_url: banner?.url ?? c.banner_url,
                forum_require_tag: forumRequireTag ?? c.forum_require_tag,
              }
            : c
        )
      );
      const sel = channelMessages.selectedChannel;
      if (sel?.id === channel.id) {
        channelMessages.selectChannel({ ...sel, name, color, icon, custom_icon_svg: customIconSvg });
      }
      setChannelSettingsModal(null);
    } catch (e) {
      setChannelSettingsError(String(e));
    } finally {
      setChannelSettingsSaving(false);
    }
  }

  async function handleDeleteChannelSettings() {
    if (!channelSettingsModal) return;
    const channelId = channelSettingsModal.id;
    setChannelSettingsDeleting(true);
    setChannelSettingsError(null);
    try {
      await invoke("delete_channel", { channelId });
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (channelMessages.selectedChannel?.id === channelId) {
        channelMessages.clearSelectedChannel();
      }
      setChannelSettingsModal(null);
    } catch (e) {
      setChannelSettingsError(String(e));
    } finally {
      setChannelSettingsDeleting(false);
    }
  }

  const channelPermissionsTabActions: ChannelPermissionsTabActions = {
    getChannelPermissions: (channelId) => invoke<ChannelPermissionsResponse>("get_channel_permissions", { channelId }),
    setChannelRolePermissions: (channelId, roleId, overwrites: ChannelRoleOverwrites) =>
      invoke<ChannelRolePermissions>("set_channel_role_permissions", {
        channelId,
        roleId,
        allow: overwrites.allow,
        deny: overwrites.deny,
      }),
    clearChannelRolePermissions: (channelId, roleId) =>
      invoke("clear_channel_role_permissions", { channelId, roleId }),
    listRoles: () => invoke<RoleInfo[]>("list_roles"),
  };

  const channelBansTabActions: ChannelBansTabActions = {
    listChannelBans: (channelId) =>
      invoke<{ target_public_key: string; reason: string | null }[]>("list_channel_bans", { channelId }).then(
        (rows) => rows.map((r) => ({ pubkey: r.target_public_key, reason: r.reason })),
      ),
    banFromChannel: (channelId, pubkey, reason) =>
      invoke("channel_ban_user", { channelId, targetPublicKey: pubkey, reason: reason ?? null }),
    unbanFromChannel: (channelId, pubkey) =>
      invoke("channel_unban_user", { channelId, targetPublicKey: pubkey }),
  };

  const channelTalkPowerTabActions: ChannelTalkPowerTabActions = {
    getTalkPower: (channelId) =>
      invoke<{ min_talk_power: number }>("get_talk_power", { channelId }).then((r) => r.min_talk_power),
    setTalkPower: (channelId, minTalkPower) =>
      invoke("set_talk_power_cmd", { channelId, minTalkPower }),
  };

  function openContextMenu(e: React.MouseEvent, channel: Channel) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, channel });
  }

  function openCreateChannelUnder(parentId: string | null) {
    setNewChannelParentId(parentId);
    setShowCreateChannel(true);
    setContextMenu(null);
  }

  useEffect(() => {
    function isTextInput(el: Element | null): boolean {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      const inText = isTextInput(document.activeElement);

      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (meta && e.key === "/") {
        e.preventDefault();
        setShowKeyboardShortcuts((v) => !v);
        return;
      }

      if (meta && e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        voice.toggleSelfMute();
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        voice.toggleSelfDeafen();
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (voice.voiceChannelId) {
          voice.handleVoiceLeave();
        } else if (channelMessages.selectedChannel && !channelMessages.selectedChannel.is_category) {
          voice.handleVoiceJoin(channelMessages.selectedChannel);
        }
        return;
      }

      if (meta && e.key === "ArrowUp") {
        e.preventDefault();
        const idx = hubs.findIndex((h) => h.hub_id === activeHubId);
        if (idx > 0) {
          const prev = hubs[idx - 1];
          handleSwitchHub(prev.hub_id);
          setView("channels");
        }
        return;
      }

      if (meta && e.key === "ArrowDown") {
        e.preventDefault();
        const idx = hubs.findIndex((h) => h.hub_id === activeHubId);
        if (idx >= 0 && idx < hubs.length - 1) {
          const next = hubs[idx + 1];
          handleSwitchHub(next.hub_id);
          setView("channels");
        }
        return;
      }

      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        if (view === "channels" && activeHubId) {
          const unreadSet = unreadByChannel[activeHubId] ?? {};
          const unreadChannels = channels.filter((c) => !c.is_category && unreadSet[c.id]);
          if (unreadChannels.length > 0) {
            const idx = channelMessages.selectedChannel
              ? unreadChannels.findIndex((c) => c.id === channelMessages.selectedChannel!.id)
              : -1;
            const prev = idx > 0 ? unreadChannels[idx - 1] : unreadChannels[unreadChannels.length - 1];
            channelMessages.selectChannel(prev);
          }
        }
        return;
      }

      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        if (view === "channels" && activeHubId) {
          const unreadSet = unreadByChannel[activeHubId] ?? {};
          const unreadChannels = channels.filter((c) => !c.is_category && unreadSet[c.id]);
          if (unreadChannels.length > 0) {
            const idx = channelMessages.selectedChannel
              ? unreadChannels.findIndex((c) => c.id === channelMessages.selectedChannel!.id)
              : -1;
            const next = idx >= 0 && idx < unreadChannels.length - 1
              ? unreadChannels[idx + 1]
              : unreadChannels[0];
            channelMessages.selectChannel(next);
          }
        }
        return;
      }

      if (meta && e.key.toLowerCase() === "f" && !inText) {
        e.preventDefault();
        channelMessages.setSearchOpen(true);
        return;
      }

      if (e.key === "/" && !inText && !meta) {
        e.preventDefault();
        channelMessages.messageInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        if (contextMenu) { setContextMenu(null); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (channelMessages.replyTarget) { channelMessages.setReplyTarget(null); return; }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hubs, activeHubId, channelMessages.selectedChannel, channels, view, voice, unreadByChannel, contextMenu, paletteOpen, channelMessages.replyTarget]);

  return (
    <div className="app">
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveAnnouncement}
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {voicePoliteAnnouncement}
      </div>
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      {updateInfo && (
        <UpdateBanner
          version={updateInfo.version}
          notes={updateInfo.notes}
          onDismiss={() => setUpdateInfo(null)}
        />
      )}
      <>
        {showFarmSettings ? (
          <FarmSettingsPage
            farmUrl={farmAdminUrl}
            tab={farmAdminTab}
            onTab={setFarmAdminTab}
            onClose={() => setShowFarmSettings(false)}
            actions={{
              getSettings: (farmUrl) => invoke<FarmSettings>("get_farm_settings", { farmUrl }),
              patchSettings: (farmUrl, settings) => invoke<FarmSettings>("patch_farm_settings", { farmUrl, settings }),
              getHubs: (farmUrl) => invoke<{ hubs: FarmHubEntry[] }>("get_farm_hubs_admin", { farmUrl }),
              suspendHub: (farmUrl, hubId, suspended, reason) => invoke("suspend_farm_hub", { farmUrl, hubId, suspended, reason }),
              deleteHub: (farmUrl, hubId) => invoke("delete_farm_hub", { farmUrl, hubId }),
              getUsers: (farmUrl, page, limit) =>
                invoke<{ users: FarmUserEntry[]; total: number; page: number; limit: number }>("get_farm_users", { farmUrl, page, limit }),
              revokeUserSessions: (farmUrl, pubkey) => invoke("revoke_farm_user_sessions", { farmUrl, pubkey }),
              getServers: (farmUrl) => invoke<{ servers: FarmServerEntry[] }>("get_farm_servers", { farmUrl }),
              generateServerToken: (farmUrl, name, region) =>
                invoke<{ server_id: string; token: string }>("generate_farm_server_token", { farmUrl, name, region }),
              totpSetup: (farmUrl) => invoke<{ secret: string; qr_url: string }>("farm_totp_setup", { farmUrl }),
              totpConfirm: (farmUrl, secret, code) => invoke("farm_totp_confirm", { farmUrl, secret, code }),
              totpDisable: (farmUrl, code) => invoke("farm_totp_disable", { farmUrl, code }),
            }}
          />
        ) : showHubAdmin ? (
          <HubAdminPage
            tab={hubAdminTab}
            onTab={setHubAdminTab}
            onClose={() => setShowHubAdmin(false)}
            hubName={adminHubName}
            onHubNameChange={setAdminHubName}
            hubDescription={adminHubDescription}
            onHubDescriptionChange={setAdminHubDescription}
            hubIcon={adminHubIcon}
            onHubIconChange={setAdminHubIcon}
            requireApproval={requireApproval}
            onRequireApprovalChange={setRequireApproval}
            minSecurityLevel={minSecurityLevel}
            onMinSecurityLevelChange={setMinSecurityLevel}
            maxChannelDepth={maxChannelDepth}
            onMaxChannelDepthChange={setMaxChannelDepth}
            welcomeLabel={adminWelcomeLabel}
            onWelcomeLabelChange={setAdminWelcomeLabel}
            welcomeInviteUrl={adminWelcomeInviteUrl}
            onWelcomeInviteUrlChange={setAdminWelcomeInviteUrl}
            timezone={hubTimezone}
            onTimezoneChange={setHubTimezone}
            birthdaysEnabled={birthdaysEnabled}
            onBirthdaysEnabledChange={setBirthdaysEnabled}
            saveError={null}
            onSave={handleSaveHubBranding}
            hubListed={hubListed}
            onHubListedChange={onHubListedChange}
            submitToDirectory={(directoryUrl, tags, language, bio, inviteCode) =>
              invoke("submit_to_directory", { directoryUrl, tags, language, bio, inviteCode })
            }
            pendingMembers={pendingMembers}
            onApproveMember={handleApproveMember}
            members={adminMembers}
            onKickMember={handleKickMember}
            onBanMember={handleBanMember}
            onMuteMember={handleMuteMember}
            onTimeoutMember={handleTimeoutMember}
            onVoiceMuteMember={voice.handleVoiceMuteMember}
            onVoiceUnmuteMember={voice.handleVoiceUnmuteMember}
            voiceMutedKeys={voice.voiceMutedKeys}
            canManageRoles={isAdmin || myRoles.some((r) => r.permissions?.includes("manage_roles"))}
            myMaxPriority={myRoles.reduce((m, r) => Math.max(m, r.priority), 0)}
            onMemberRolesChanged={() => refreshMembers()}
            bans={adminBans}
            onUnban={handleUnban}
            invites={adminInvites}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            hubSerial={activeHubId ?? ""}
            myPubkey={publicKey ?? ""}
            isAdmin={isAdmin}
            canManageSoundboard={isAdmin || myRoles.some((r) => r.permissions?.includes("manage_soundboard"))}
            soundboardActions={soundboard.soundboardActions}
            onCreateInvite={handleCreateInvite}
            onRevokeInvite={handleRevokeInvite}
            channels={channels}
            rolesActions={{
              listRoles: () => invoke<RoleInfo[]>("list_roles"),
              createRole: (input) =>
                invoke<RoleInfo>("create_role", {
                  name: input.name,
                  permissions: input.permissions,
                  priority: input.priority,
                  displaySeparately: input.display_separately,
                }),
              updateRole: (roleId, updates) =>
                invoke<RoleInfo>("update_role", {
                  roleId,
                  name: updates.name ?? null,
                  permissions: updates.permissions ?? null,
                  priority: updates.priority ?? null,
                  displaySeparately: updates.display_separately ?? null,
                  color: updates.color ?? null,
                  icon: updates.icon ?? null,
                  categoryId: updates.category_id ?? null,
                }),
              deleteRole: (roleId) => invoke("delete_role", { roleId }),
              listRoleCategories: () => invoke<RoleCategory[]>("list_role_categories"),
              createRoleCategory: (input) =>
                invoke<RoleCategory>("create_role_category", { name: input.name, position: input.position }),
              updateRoleCategory: (id, updates) =>
                invoke<RoleCategory>("update_role_category", {
                  categoryId: id,
                  name: updates.name ?? null,
                  color: updates.color ?? null,
                  icon: updates.icon ?? null,
                  position: updates.position ?? null,
                }),
              deleteRoleCategory: (id) => invoke("delete_role_category", { categoryId: id }),
            } as RolesSectionActions}
            memberRoleActions={{
              listRoles: () => invoke<RoleInfo[]>("list_roles"),
              listUserRoles: (pubkey) => invoke<RoleInfo[]>("list_user_roles", { targetPublicKey: pubkey }),
              assignRoleToUser: (pubkey, roleId) => invoke("assign_role", { targetPublicKey: pubkey, roleId }),
              removeRoleFromUser: (pubkey, roleId) => invoke("unassign_role", { targetPublicKey: pubkey, roleId }),
            } as MemberRoleManagerActions}
            serverTagsActions={{
              getDiscoveryTags: () => invoke<HubSelfTagSettings>("get_discovery_settings"),
              setDiscoveryTags: (tags, nsfw) => invoke("set_discovery_tags", { tags, nsfw }),
              listBadges: () => invoke<HubBadge[]>("list_badges"),
              listPendingBadges: () => invoke<PendingBadgeOffer[]>("list_pending_badges"),
              acceptBadge: (id) => invoke("accept_badge", { badgeId: id }),
              declineBadge: (id) => invoke("decline_badge", { badgeId: id }),
              removeBadge: (id) => invoke("remove_badge", { badgeId: id }),
              grantBadge: (targetHubUrl, label) => invoke("grant_badge", { targetHubUrl, label }),
            } as ServerTagsSectionActions}
            inviteActions={{
              listRoles: () => invoke<RoleInfo[]>("list_roles"),
              getHubSettings: () =>
                invoke<{ default_invite_role_id: string | null }>("get_hub_settings").then((s) => ({
                  default_invite_role_id: s.default_invite_role_id ?? null,
                })),
              saveHubSettings: (settings) =>
                invoke("update_hub_branding", { defaultInviteRoleId: settings.default_invite_role_id }),
            } as InviteManagerActions}
            webhookActions={{
              loadWebhooks: () => invoke<WebhookInfo[]>("admin_list_webhooks", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
              createWebhook: (channelId, displayName, avatarUrl) =>
                invoke<WebhookCreatedResult>("admin_create_webhook", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", channelId, displayName, avatarUrl }),
              regenerateWebhook: (webhookId) =>
                invoke<WebhookCreatedResult>("admin_regenerate_webhook", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", webhookId }),
              deleteWebhook: (webhookId) => invoke("admin_delete_webhook", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", webhookId }),
            }}
            externalBotActions={{
              loadBots: () => invoke<ExternalBotRow[]>("admin_list_external_bots", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
              addBot: (pubkey, localNote) =>
                invoke<ExternalBotInviteResult>("admin_add_external_bot", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", pubkey, localNote }),
              removeBot: (pubkey) => invoke("admin_remove_external_bot", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", pubkey }),
              getBotChannelScope: (pubkey) => invoke<string[]>("admin_get_bot_channel_scope", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", pubkey }),
              setBotChannelScope: (pubkey, channelIds) =>
                invoke("admin_set_bot_channel_scope", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", pubkey, channelIds }),
            }}
            nativeBotActions={{
              listNativeBots: () => invoke<BotAdminInfo[]>("admin_list_bots", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
              createNativeBot: (input) =>
                invoke<BotCreatedResult>("admin_create_bot", {
                  hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "",
                  displayName: input.display_name,
                  miniAppUrl: input.mini_app_url ?? null,
                  requiresCamera: input.requires_camera ?? false,
                }),
              deleteNativeBot: (pubkey) => invoke("admin_delete_bot", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", pubkey }),
              getBotDetail: (pubkey) => invoke<BotDetailInfo>("admin_get_bot_detail", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", pubkey }),
              setBotWebhook: (pubkey, webhookUrl) =>
                invoke("admin_set_bot_webhook", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", pubkey, webhookUrl }),
            } as NativeBotsSectionActions}
            auditLogActions={{
              getAuditLog: (opts) =>
                invoke<AuditLogPage>("get_audit_log", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", cursor: opts.cursor ?? null, limit: opts.limit ?? null }),
            } as AuditLogSectionActions}
            certActions={{
              listCertIssuances: () => invoke<CertIssuance[]>("list_issued_certs", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
              getCertSettings: () => invoke<CertAdmissionSettings>("get_cert_settings", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
              saveCertSettings: (settings) => invoke("save_cert_settings", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", settings }),
              issueCertManual: (subjectPubkey) => invoke("issue_cert", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", subjectPubkey }),
              revokeCert: (subjectPubkey) => invoke("revoke_cert", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", subjectPubkey }),
              grantUserBadge: (subjectPubkey, label) =>
                invoke("grant_user_badge", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", subjectPubkey, label }),
            } as CertificationsSectionActions}
            onboardingActions={{
              listPendingUsers: () => invoke<PendingUser[]>("list_pending_members"),
              approvePendingUser: (pk) => invoke("approve_member", { targetPublicKey: pk }),
              setLobbySettings: (lobbyEnabled, welcomeMd) =>
                invoke("set_lobby_settings", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", lobbyEnabled, welcomeMd: welcomeMd ?? null }),
              setChallengeSettings: (mode, difficulty) =>
                invoke("set_challenge_settings", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", challengeMode: mode, challengeDifficulty: difficulty }),
              getLobbyWelcome: () =>
                invoke<{ welcome_md: string }>("lobby_get_welcome", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
            } as OnboardingAdminSectionActions}
            allianceActions={{
              listAlliances: () => invoke<Alliance[]>("list_alliances"),
              createAlliance: (name) => invoke<Alliance>("create_alliance", { name }),
              leaveAlliance: (allianceId) => invoke("leave_alliance", { allianceId }),
              listPendingAllianceInvites: () => invoke<PendingAllianceInvite[]>("list_pending_alliance_invites"),
              acceptAllianceInvite: (inviteId, ownHubUrl) =>
                invoke("respond_to_alliance_invite", { inviteId, accept: true, ownHubUrl }),
              declineAllianceInvite: (inviteId) =>
                invoke("respond_to_alliance_invite", { inviteId, accept: false }),
              listAllianceSharedChannels: (allianceId) =>
                invoke<SharedChannel[]>("list_alliance_shared_channels", { allianceId }),
              shareChannelWithAlliance: (allianceId, channelId, includeDescendants) =>
                invoke("share_channel_with_alliance", { allianceId, channelId, includeDescendants }),
              unshareChannelFromAlliance: (allianceId, channelId) =>
                invoke("unshare_channel_from_alliance", { allianceId, channelId }),
              createAllianceInvite: (allianceId) => invoke<AllianceInvite>("create_alliance_invite", { allianceId }),
              sendAlliancePushInvite: (allianceId, targetHubUrl, ownHubUrl, message) =>
                invoke("send_alliance_push_invite", { allianceId, targetHubUrl, ownHubUrl, message }),
              joinAllianceByCode: (inviterHubUrl, allianceId, inviteToken, ownHubUrl) =>
                invoke("join_alliance", {
                  inviterHubUrl, allianceId, inviteToken, ownHubPublicUrl: ownHubUrl,
                }).then(() => {}),
            }}
            hubIconActions={{
              listHubIcons: () => invoke<HubIcon[]>("list_hub_icons"),
              createHubIcon: (name, svgContent) => invoke<HubIcon>("create_hub_icon", { name, svgContent }),
              renameHubIcon: (iconId, name) => invoke("rename_hub_icon", { iconId, name }),
              deleteHubIcon: (iconId) => invoke("delete_hub_icon", { iconId }),
            }}
            surveyActions={{
              getSurveyAdmin: () => invoke<SurveyAdmin | null>("survey_admin_get", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
              setSurveyAdmin: (survey) => invoke("survey_admin_put", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", survey }),
              getSurveyResponses: () =>
                invoke<SurveyResponseView[]>("survey_admin_responses", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", status: "all" }),
              loadAssignableRoles: () =>
                invoke<RoleInfo[]>("list_roles").then((roles) =>
                  roles.filter((r) => !r.permissions.includes("admin")).map((r) => ({ id: r.id, name: r.name }))
                ),
            }}
          />
        ) : showSettings ? (
          <SettingsPage
            tab={settingsTab}
            onTab={setSettingsTab}
            onClose={closeSettings}
            hubs={hubs}
            theme={theme}
            onThemeChange={handleSetTheme}
            skin={skin}
            onSkinChange={handleSkinChange}
            onImportSkin={(s) => { handleSkinChange(s); handleSetTheme("custom"); }}
            backgroundMode={video.backgroundMode}
            backgroundSource={video.backgroundSource}
            backgroundActive={video.backgroundActive}
            onChangeBackground={video.changeBackground}
            videoInputs={video.videoInputs}
            videoInputDevice={video.videoInputDevice}
            onVideoInputDeviceChange={video.setVideoInputDevice}
            activeHubId={activeHubId}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            isAdmin={isAdmin}
            publicKey={publicKey}
            audioInputs={voice.audioInputs}
            audioOutputs={voice.audioOutputs}
            voiceInputDevice={voice.voiceInputDevice}
            voiceOutputDevice={voice.voiceOutputDevice}
            onInputDeviceChange={(v) => {
              voice.setVoiceInputDevice(v);
              voice.persistVoiceSettings(v, voice.voiceOutputDevice, voice.vadThreshold);
            }}
            onOutputDeviceChange={(v) => {
              voice.setVoiceOutputDevice(v);
              voice.persistVoiceSettings(voice.voiceInputDevice, v, voice.vadThreshold);
            }}
            mediaOutputDevices={voice.mediaOutputDevices}
            mediaOutputDeviceId={voice.mediaOutputDeviceId}
            onMediaOutputDeviceChange={voice.setMediaOutputDeviceId}
            vadThreshold={voice.vadThreshold}
            onVadChange={(v) => {
              voice.setVadThreshold(v);
              voice.persistVoiceSettings(voice.voiceInputDevice, voice.voiceOutputDevice, v);
            }}
            voiceMode={voice.voiceMode}
            onVoiceModeChange={(m) => {
              voice.setVoiceMode(m);
              voice.persistVoiceSettings(voice.voiceInputDevice, voice.voiceOutputDevice, voice.vadThreshold, m, voice.pttKey);
            }}
            pttKey={voice.pttKey}
            onPttKeyChange={(k) => {
              voice.setPttKey(k);
              voice.persistVoiceSettings(voice.voiceInputDevice, voice.voiceOutputDevice, voice.vadThreshold, voice.voiceMode, k);
            }}
            audioProfile={voice.audioProfile}
            onAudioProfileChange={(p) => {
              voice.setAudioProfile(p);
              voice.persistAudioSettings(p);
            }}
            customBitrate={voice.customBitrate}
            onCustomBitrateChange={(v) => {
              voice.setCustomBitrate(v);
              voice.persistAudioSettings(undefined, v);
            }}
            customApp={voice.customApp}
            onCustomAppChange={(v) => {
              voice.setCustomApp(v);
              voice.persistAudioSettings(undefined, undefined, v);
            }}
            customNoiseSuppress={voice.customNoiseSuppress}
            onCustomNoiseSuppressChange={(v) => {
              voice.setCustomNoiseSuppress(v);
              voice.persistAudioSettings(undefined, undefined, undefined, v);
            }}
            customVad={voice.customVad}
            onCustomVadChange={(v) => {
              voice.setCustomVad(v);
              voice.persistAudioSettings(undefined, undefined, undefined, undefined, v);
            }}
            customVadThreshold={voice.customVadThreshold}
            onCustomVadThresholdChange={(v) => {
              voice.setCustomVadThreshold(v);
              voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, v);
            }}
            customChannels={voice.customChannels}
            onCustomChannelsChange={(v) => {
              voice.setCustomChannels(v);
              voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, undefined, v);
            }}
            customFrameMs={voice.customFrameMs}
            onCustomFrameMsChange={(v) => {
              voice.setCustomFrameMs(v);
              voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, undefined, undefined, v);
            }}
            customComplexity={voice.customComplexity}
            onCustomComplexityChange={(v) => {
              voice.setCustomComplexity(v);
              voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, v);
            }}
            inVoice={voice.voiceChannelId !== null}
            mentionPingEnabled={channelMessages.mentionPingEnabled}
            onMentionPingChange={channelMessages.setMentionPingEnabled}
            micLevel={voice.micLevel}
            micTesting={voice.micTesting}
            onToggleMicTest={voice.toggleMicTest}
            recoveryPhrase={recoveryPhrase}
            onShowRecovery={handleShowRecovery}
            onRecoverIdentity={handleRecoverIdentity}
            onClearLocalData={handleClearLocalData}
            blocks={Array.from(blockedUsers).map((p) => ({ pubkey: p, since: 0 }))}
            ignores={Array.from(ignoredUsers).map((p) => ({ pubkey: p, since: 0 }))}
            onUnblock={toggleBlockUser}
            onUnignore={toggleIgnoreUser}
            knownNames={pubkeyToName}
            hideBirthdays={hideBirthdays}
            onToggleHideBirthdays={() => setHideBirthdays((v) => !v)}
          />
        ) : (
          <div className="main-layout">
            <HubSidebar
              hubs={hubs}
              activeHubId={activeHubId}
              view={view}
              showDiscover={showDiscover}
              unreadDms={unreadDms}
              unreadByHub={unreadByHub}
              pingByHub={pingByHub}
              hubNotifyMode={hubNotifyMode}
              lobbyHubIds={lobbyHubIds}
              hasActiveHub={hasActiveHub}
              onSwitchToDms={() => { setView("dms"); if (hasActiveHub) loadConversations(); }}
              onSwitchHub={(hubId) => { handleSwitchHub(hubId); setView("channels"); setShowDiscover(false); }}
              onRemoveHub={handleRemoveHub}
              onSetHubNotifyMode={setHubMode}
              onHubReorder={handleHubReorder}
              onAddHub={() => setShowAddHub(true)}
              onCreateHub={() => setShowCreateHub(true)}
              onDiscover={() => setShowDiscover((v) => !v)}
              onFarmSettings={() => { setShowFarmSettings(true); setFarmAdminTab("general"); }}
              isFarmAdmin={isFarmAdmin}
            />
            {showDiscover ? (
              <DiscoverPage
                onClose={() => setShowDiscover(false)}
                onJoinHub={handleDiscoverJoin}
                fetchUrl={(url) => fetchWithTimeout(url)}
              />
            ) : showHubBrowser ? (
              <HubBrowser
                onClose={() => setShowHubBrowser(false)}
                onJoinHub={(url, code) => {
                  setHubUrl(url);
                  setInviteCode(code);
                  setShowHubBrowser(false);
                  setShowAddHub(true);
                }}
              />
            ) : !hasActiveHub ? (
              showWelcome ? (
                <WelcomeScreen
                  hubUrl={hubUrl}
                  onHubUrlChange={handleHubUrlChange}
                  hubPreview={hubPreview}
                  loading={loading}
                  error={error}
                  onJoin={() => handleAddHub()}
                  onBrowse={() => setShowDiscover(true)}
                  onCheckHubUrl={() => setShowHubBrowser(true)}
                  onDismiss={dismissWelcome}
                />
              ) : (
                <div className="empty-state">
                  <p className="muted">No hubs connected.</p>
                  <button className="primary" onClick={() => setShowAddHub(true)}>
                    Add hub
                  </button>
                </div>
              )
            ) : activeHubId && hubScope[activeHubId] === "lobby" && publicKey ? (
              <Lobby
                hubId={activeHubId}
                hubName={hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? ""}
                pubkeyHex={publicKey}
                actions={{
                  getStatus: () => invoke<LobbyStatus>("lobby_status", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
                  getWelcome: () => invoke<{ welcome_md: string }>("lobby_get_welcome", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "" }),
                  submitProof: (powProof) => invoke<{ promoted: boolean; new_level: number }>("lobby_submit_proof", { hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "", powProof }),
                }}
                onPromoted={() => {
                  setHubScope((prev) => ({ ...prev, [activeHubId]: "member" }));
                  loadHubData();
                  setToast(`You're in. Welcome to ${hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? "the hub"}.`);
                  const resolvedUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "";
                  invoke<{ id: string } | null>("survey_current", { hubUrl: resolvedUrl })
                    .then((survey) => { if (survey) setPendingSurveyHubId(activeHubId); })
                    .catch(() => {});
                }}
              />
            ) : myApprovalStatus === "pending" ? (
              <div className="empty-state pending-approval">
                <div className="pending-approval-icon">⏳</div>
                <h1>Waiting for approval</h1>
                <p>
                  <strong>
                    {hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? "This hub"}
                  </strong>{" "}
                  requires admin approval before new members can join in.
                </p>
                <p className="muted">
                  You'll get access automatically once an admin approves your
                  request — feel free to leave the app open or come back later.
                </p>
                <button onClick={loadHubData} className="primary">
                  Check again
                </button>
                {hubs.length > 1 && (
                  <p className="muted" style={{ marginTop: "var(--space-4)" }}>
                    Switch to another hub from the sidebar if you'd like to keep
                    chatting elsewhere in the meantime.
                  </p>
                )}
              </div>
            ) : (
              <>
                <ChannelSidebar
                  view={view}
                  activeHubId={activeHubId}
                  hubs={hubs}
                  channels={channels}
                  selectedChannel={channelMessages.selectedChannel}
                  unreadByChannel={unreadByChannel}
                  collapsedCategories={collapsedCategories}
                  voicePartByChannel={voice.voicePartByChannel}
                  voiceChannelId={voice.voiceChannelId}
                  voiceChannelNameHint={voiceChannelNameHint}
                  selfMuted={voice.selfMuted}
                  selfDeafened={voice.selfDeafened}
                  users={users}
                  publicKey={publicKey}
                  pingByHub={pingByHub}
                  isAdmin={isAdmin}
                  canOpenChannelSettings={isAdmin || myRoles.some((r) => r.permissions?.includes("manage_roles"))}
                  canCreateInvites={canCreateInvites}
                  hasDraft={hasDraft}
                  hubNotifyMode={hubNotifyMode}
                  hubDropdownOpen={hubDropdownOpen}
                  hubTimezone={activeHubTimezone}
                  hideSilenced={hideSilenced}
                  silencedChannelIds={silencedChannelIds}
                  userAlliances={userAlliances}
                  allianceChannels={allianceChannels}
                  selectedAllianceChannel={channelMessages.selectedAllianceChannel}
                  conversations={conversations}
                  selectedConversation={selectedConversation}
                  unreadDms={unreadDms}
                  channelTree={channelTree}
                  effectiveNotifyMode={effectiveNotifyMode}
                  onToggleCategoryCollapsed={toggleCategoryCollapsed}
                  onHubDropdownOpenChange={setHubDropdownOpen}
                  onSetHubMode={setHubMode}
                  onClearHubUnread={(hubId) => { clearHubUnread(hubId); clearHubFirstNotify(hubId); }}
                  onRemoveHub={handleRemoveHub}
                  onOpenHubAdmin={() => { setHubDropdownOpen(false); openHubAdmin(); }}
                  onOpenHubAdminInvites={() => { setHubDropdownOpen(false); openHubAdminInvites(); }}
                  onOpenQuickInvite={() => setShowQuickInvite(true)}
                  onOpenCreateChannel={openCreateChannelUnder}
                  onSelectChannel={channelMessages.selectChannel}
                  onChannelContextMenu={openContextMenu}
                  onOpenChannelSettings={(ch) => setChannelSettingsModal(ch)}
                  onVoiceJoin={voice.handleVoiceJoin}
                  onVoiceLeave={voice.handleVoiceLeave}
                  onParticipantContextMenu={canMoveMembers ? (e, p, channelId) => {
                    e.preventDefault();
                    if (p.public_key === publicKey) return; // hide self — move your own voice by joining directly
                    setVoiceMoveMenu({
                      pubkey: p.public_key,
                      displayName: p.display_name || formatPubkey(p.public_key),
                      position: { x: e.clientX, y: e.clientY },
                      currentChannelId: channelId,
                    });
                  } : undefined}
                  onSelectAllianceChannel={channelMessages.selectAllianceChannel}
                  onSelectConversation={selectConversation}
                  onOpenFriends={openFriends}
                  onToggleSelfMute={voice.toggleSelfMute}
                  onToggleSelfDeafen={voice.toggleSelfDeafen}
                  onOpenSettings={openSettings}
                  onDragEnd={handleDragEnd}
                  onToggleHideSilenced={() => setHideSilenced((v) => !v)}
                  sharing={voice.sharing}
                  onScreenShare={voice.handleScreenShare}
                  onOpenSearch={() => setShowSearchBar(true)}
                  myStatus={myPresence.status === "online" ? null : myPresence.status}
                  onSetStatus={handleSetStatus}
                  voiceGains={voice.voiceGains}
                  onSetVoiceGain={voice.setVoiceGain}
                  inboundWhispers={whisper.inboundWhispers}
                  isWhispering={whisper.isWhispering}
                  whisperTargets={whisper.whisperTargets}
                  whisperLists={whisper.whisperLists}
                  showWhisperPanel={showWhisperPanel}
                  onToggleWhisperPanel={() => setShowWhisperPanel(p => !p)}
                  onCloseWhisperPanel={() => setShowWhisperPanel(false)}
                  onStartWhisper={whisper.startWhisper}
                  onStopWhisper={whisper.stopWhisper}
                  onSaveWhisperList={whisper.saveWhisperList}
                  onDeleteWhisperList={whisper.deleteWhisperList}
                  videoEnabled={video.videoEnabled}
                  onToggleVideo={(deviceId) => video.videoEnabled ? video.disableVideo() : video.enableVideo(deviceId)}
                  canUseSoundboard={isAdmin || myRoles.some((r) => r.permissions?.includes("use_soundboard"))}
                  onListSoundboardClips={soundboard.listClips}
                  onTriggerSoundboardClip={soundboard.triggerClip}
                  soundboardPlayingClipId={soundboard.playingClipId}
                />
                {showSearchBar && (
                  <SearchBar
                    onSearch={(q) => invoke<GlobalSearchResult[]>("search_messages_global", { q })}
                    onClose={() => setShowSearchBar(false)}
                    onNavigate={(channelId, _messageId) => {
                      const ch = channels.find((c) => c.id === channelId);
                      if (ch) channelMessages.selectChannel(ch);
                      setShowSearchBar(false);
                    }}
                  />
                )}
                {voiceMoveToast && (
                  <VoiceMoveToast
                    channelName={voiceMoveToast.channelName}
                    canRejoin={voiceMoveToast.sourceChannelId !== null}
                    onRejoin={handleRejoinPreviousVoiceChannel}
                    onDismiss={() => {
                      setVoiceMoveToast(null);
                      if (voiceMoveToastTimerRef.current) { clearTimeout(voiceMoveToastTimerRef.current); voiceMoveToastTimerRef.current = null; }
                    }}
                  />
                )}
                {voiceMovePrompt && (
                  <VoiceMovePromptModal
                    channelName={voiceMovePrompt.targetChannelName}
                    onAccept={handleAcceptVoiceMove}
                    onDecline={handleDeclineVoiceMove}
                  />
                )}
                {voiceMoveMenu && (
                  <VoiceMoveMenu
                    displayName={voiceMoveMenu.displayName}
                    position={voiceMoveMenu.position}
                    channels={voiceMoveChannelOptions}
                    onMove={(channelId) => { handleMoveMember(voiceMoveMenu.pubkey, channelId); setVoiceMoveMenu(null); }}
                    onClose={() => setVoiceMoveMenu(null)}
                  />
                )}
                {(video.videoEnabled || video.remoteStreams.size > 0) && (
                  <VideoGrid
                    tiles={buildTiles(
                      video.remoteStreams,
                      video.videoPubkeys,
                      users,
                      voice.speakingPubkeys,
                      video.pinnedPubkey,
                    )}
                    selfStream={video.processedStream}
                    selfName={myDisplayName ?? "You"}
                    onPin={video.setPinnedPubkey}
                    onUnpin={() => video.setPinnedPubkey(null)}
                  />
                )}
                {channelMessages.selectedChannel && (() => {
                  const channelId = channelMessages.selectedChannel.id;
                  const cards = Array.from(activeBotApps.values()).filter(
                    (e) => e.channel_id === channelId
                  );
                  if (cards.length === 0) return null;
                  return (
                    <div className="bot-app-launch-cards">
                      {cards.map((ev) => (
                        <BotAppLaunchCard
                          key={ev.bot_id}
                          event={ev}
                          onJoin={sendBotAppJoin}
                        />
                      ))}
                    </div>
                  );
                })()}
                <ContentArea
                  view={view}
                  activeHubId={activeHubId}
                  hubs={hubs}
                  channels={channels}
                  selectedChannel={channelMessages.selectedChannel}
                  selectedConversation={selectedConversation}
                  selectedAllianceChannel={channelMessages.selectedAllianceChannel}
                  messages={channelMessages.messages}
                  searchResults={channelMessages.searchResults}
                  searchOpen={channelMessages.searchOpen}
                  searchQuery={channelMessages.searchQuery}
                  dmMessages={dmMessages}
                  allianceMessages={channelMessages.allianceMessages}
                  users={users}
                  publicKey={publicKey}
                  blockedUsers={blockedUsers}
                  ignoredUsers={ignoredUsers}
                  knownDisplayNames={knownDisplayNames}
                  myDisplayName={myDisplayName}
                  isAdmin={isAdmin}
                  myRoles={myRoles}
                  editingMessageId={channelMessages.editingMessageId}
                  editingDraft={channelMessages.editingDraft}
                  replyTarget={channelMessages.replyTarget}
                  pendingAttachments={channelMessages.pendingAttachments}
                  stickToBottom={channelMessages.stickToBottom}
                  newWhileScrolledUp={channelMessages.newWhileScrolledUp}
                  hubConnected={hubConnected}
                  reconnectingHubs={reconnectingHubs}
                  memberSidebarHidden={memberSidebarHidden}
                  voiceActiveUsers={voice.voiceActiveUsers}
                  hideBirthdays={hideBirthdays}
                  inputText={channelMessages.inputText}
                  typingByKey={typingByKey}
                  dmTypingByKey={dmTypingByKey}
                  messagesEndRef={channelMessages.messagesEndRef}
                  messagesEndChannelRef={channelMessages.messagesEndChannelRef}
                  messagesContainerRef={channelMessages.messagesContainerRef}
                  messageInputRef={channelMessages.messageInputRef}
                  onReconnect={handleReconnect}
                  onToggleReaction={channelMessages.toggleReaction}
                  onSetReplyTarget={channelMessages.setReplyTarget}
                  onSaveEdit={channelMessages.handleSaveEditedMessage}
                  onCancelEdit={channelMessages.cancelEditingMessage}
                  onStartEdit={channelMessages.startEditingMessage}
                  onDeleteMessage={channelMessages.handleDeleteMessage}
                  onSend={channelMessages.handleSend}
                  onSendDm={handleSendDm}
                  onSendAllianceMessage={channelMessages.handleSendAllianceMessage}
                  onPingTyping={pingTyping}
                  onPingDmTyping={pingDmTyping}
                  onSetPendingAttachments={channelMessages.setPendingAttachments}
                  onAttachFiles={channelMessages.attachFiles}
                  onOpenEditDescription={openEditDescription}
                  firstNotifyingMessageId={
                    activeHubId && channelMessages.selectedChannel
                      ? (firstNotifyId[activeHubId]?.[channelMessages.selectedChannel.id] ?? null)
                      : null
                  }
                  onClearFirstNotify={() => {
                    if (activeHubId && channelMessages.selectedChannel)
                      clearFirstNotify(activeHubId, channelMessages.selectedChannel.id);
                  }}
                  onScrollToMessage={channelMessages.scrollToMessage}
                  onSetMemberSidebarHidden={setMemberSidebarHidden}
                  onSetSearchOpen={channelMessages.setSearchOpen}
                  onSetSearchQuery={channelMessages.setSearchQuery}
                  onCloseSearch={channelMessages.closeSearch}
                  onJumpToBottom={channelMessages.jumpToBottom}
                  onMessagesScroll={channelMessages.handleMessagesScroll}
                  onSetUserContextMenu={setUserContextMenu}
                  onSetEditingDraft={channelMessages.setEditingDraft}
                  onInputTextChange={(v) => {
                    channelMessages.setInputText(v);
                    if (activeHubId && channelMessages.selectedChannel) saveDraft(`${activeHubId}/${channelMessages.selectedChannel.id}`, v);
                  }}
                  onKeyDown={channelMessages.handleKeyDown}
                  slashCommands={slashCommands}
                  onOpenImage={openImage}
                  onToast={setToast}
                  onError={setError}
                  onOpenHubStreams={() => setShowHubStreams(true)}
                  voicePartByChannel={voice.voicePartByChannel}
                  canMoveMembers={canMoveMembers}
                  onMoveMember={handleMoveMember}
                />
                {showHubStreams && (
                  <HubStreamsPanel
                    streams={voice.hubStreams}
                    subscribedIds={voice.subscribedStreamIds.current}
                    currentChannelId={channelMessages.selectedChannel?.id ?? null}
                    channels={channels}
                    nameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
                    onWatch={voice.subscribeToStream}
                    onStopWatch={voice.unsubscribeFromStream}
                    onClose={() => setShowHubStreams(false)}
                  />
                )}
              </>
            )}
          </div>
        )}

        {botChallenge && (
          <BotChallenge
            hubUrl={botChallenge.hubUrl}
            pubkey={botChallenge.pubkey}
            onPassed={(token) => {
              setBotChallenge(null);
              handleAddHub(token);
            }}
            onCancel={() => {
              setBotChallenge(null);
              setLoading(false);
            }}
          />
        )}

        {pendingSurveyHubId && (() => {
          const surveyHub = hubs.find((h) => h.hub_id === pendingSurveyHubId);
          if (!surveyHub) return null;
          return (
            <SurveyComponent
              hubUrl={surveyHub.hub_url}
              onComplete={(result: SurveySubmitResult) => {
                setPendingSurveyHubId(null);
                if (result.next_state === "pending") {
                  setMyApprovalStatus("pending");
                }
              }}
            />
          );
        })()}

        {showAddHub && (
          <AddHubModal
            hubUrl={hubUrl}
            onHubUrlChange={handleHubUrlChange}
            hubPreview={hubPreview}
            loading={loading}
            error={error}
            onAdd={() => handleAddHub()}
            onClose={() => { setShowAddHub(false); setHubUrl(""); setInviteCode(""); }}
            onBrowse={() => { setShowAddHub(false); setShowHubBrowser(true); }}
          />
        )}

        {showQuickInvite && activeHubId && (
          <QuickInviteModal
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            hubSerial={activeHubId}
            myMaxPriority={myRoles.reduce((m, r) => Math.max(m, r.priority), 0)}
            onClose={() => setShowQuickInvite(false)}
            actions={{
              listRoles: () => invoke<RoleInfo[]>("list_roles"),
              createInvite: (maxUses, expiresInSeconds, grantRoleId) =>
                invoke<InviteInfo>("create_invite", { maxUses, expiresInSeconds, grantRoleId }),
            }}
          />
        )}

        {showCreateChannel && (
          <CreateChannelModal
            parentId={newChannelParentId}
            parentName={newChannelParentId ? (channels.find((c) => c.id === newChannelParentId)?.name ?? null) : null}
            loading={createChannelLoading}
            error={createChannelError}
            onSubmit={handleCreateChannel}
            onClose={() => { setShowCreateChannel(false); setCreateChannelError(null); }}
          />
        )}

        {showFriends && (
          <FriendsModal
            actions={{
              listFriends: () => invoke<Friend[]>("list_friends"),
              listPendingFriendRequests: () => invoke<Friend[]>("list_pending_friends"),
              sendFriendRequest: (targetPublicKey, hubUrl) =>
                invoke("send_friend_request", { targetPublicKey, friendHubUrl: hubUrl ?? null, displayName: null }),
              acceptFriendRequest: (fromPublicKey) => invoke("accept_friend", { fromPublicKey }),
              removeFriend: (targetPublicKey) => invoke("remove_friend", { targetPublicKey }),
            }}
            onMessage={startDmWithAndClose}
            onClose={() => setShowFriends(false)}
          />
        )}

        {contextMenu && (
          <ChannelContextMenu
            menu={contextMenu}
            activeHubId={activeHubId}
            effectiveNotifyMode={effectiveNotifyMode}
            onClose={() => setContextMenu(null)}
            onRename={handleRenameChannel}
            onSetMode={setChannelMode}
            onOpenCreateChannel={openCreateChannelUnder}
            onEditAppearance={handleEditAppearance}
            onDelete={handleDeleteChannel}
            onEditBanner={(ch) => { setContextMenu(null); setBannerEditChannel(ch); }}
          />
        )}

        {editDescriptionChannel && (
          <EditDescriptionModal
            channel={editDescriptionChannel}
            description={editDescriptionValue}
            onDescriptionChange={setEditDescriptionValue}
            onSave={handleSaveDescription}
            onClose={() => setEditDescriptionChannel(null)}
          />
        )}

        {appearanceChannel && (
          <ChannelAppearanceModal
            channel={appearanceChannel}
            onSave={(icon, color, customIconSvg) => handleSaveAppearance(appearanceChannel, icon, color, customIconSvg)}
            onClose={() => setAppearanceChannel(null)}
          />
        )}

        {bannerEditChannel && (
          <BannerEditModal
            channel={bannerEditChannel}
            onSave={handleSaveBannerUrl}
            onClose={() => setBannerEditChannel(null)}
          />
        )}

        {channelSettingsModal && (
          <ChannelSettingsModal
            channel={channelSettingsModal}
            saving={channelSettingsSaving}
            deleting={channelSettingsDeleting}
            error={channelSettingsError}
            canManageRoles={isAdmin || myRoles.some((r) => r.permissions?.includes("manage_roles"))}
            isAdmin={isAdmin}
            myMaxPriority={myRoles.reduce((m, r) => Math.max(m, r.priority), 0)}
            hubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url}
            onSave={handleSaveChannelSettings}
            onDelete={handleDeleteChannelSettings}
            onClose={() => { setChannelSettingsModal(null); setChannelSettingsError(null); }}
            permissionsActions={channelPermissionsTabActions}
            bansActions={channelBansTabActions}
            bansUsers={users}
            bansSupportReason
            talkPowerActions={channelTalkPowerTabActions}
            listHubIcons={() => invoke<HubIcon[]>("list_hub_icons")}
            bannerUploadSupported={true}
            listForumTags={(channelId) => invoke<ForumTagDef[]>("forum_list_tags", { channelId })}
            forumTagsActions={{
              createTag: (channelId, label, color, position) =>
                invoke<ForumTagDef>("forum_create_tag", { channelId, label, color: color ?? null, position: position ?? null }),
              editTag: (tagId, updates) =>
                invoke<ForumTagDef>("forum_edit_tag", {
                  tagId,
                  label: updates.label ?? null,
                  color: updates.color ?? null,
                  position: updates.position ?? null,
                }),
              deleteTag: (tagId) => invoke<void>("forum_delete_tag", { tagId }),
            }}
          />
        )}

        {paletteOpen && (
          <ChannelPalette
            channels={channels.filter((c) => !c.is_category)}
            onClose={() => setPaletteOpen(false)}
            onSelect={(c) => { setPaletteOpen(false); channelMessages.selectChannel(c); }}
          />
        )}

        {lightbox && (
          <Lightbox
            src={lightbox.src}
            alt={lightbox.alt}
            onClose={() => setLightbox(null)}
          />
        )}

        {userContextMenu && (
          <UserContextMenu
            user={userContextMenu.user}
            publicKey={publicKey}
            isAdmin={isAdmin}
            canManageRoles={isAdmin || myRoles.some((r) => r.permissions?.includes("manage_roles"))}
            myMaxPriority={myRoles.reduce((m, r) => Math.max(m, r.priority), 0)}
            blockedUsers={blockedUsers}
            ignoredUsers={ignoredUsers}
            position={{ x: userContextMenu.x, y: userContextMenu.y }}
            onClose={() => setUserContextMenu(null)}
            onToast={setToast}
            onRolesChanged={() => { void refreshMembers(); }}
            actions={{
              listRoles: () => invoke<RoleInfo[]>("list_roles"),
              listUserRoles: async (pubkey) => {
                const [all, members] = await Promise.all([
                  invoke<RoleInfo[]>("list_roles"),
                  invoke<MemberAdminInfo[]>("list_hub_members"),
                ]);
                const ids = new Set(members.find((m) => m.public_key === pubkey)?.roles.map((r) => r.id) ?? []);
                return all.filter((r) => ids.has(r.id));
              },
              assignRole: (pubkey, roleId) => invoke("assign_role", { targetPublicKey: pubkey, roleId }),
              removeRole: (pubkey, roleId) => invoke("unassign_role", { targetPublicKey: pubkey, roleId }),
              muteUser: (pubkey) => invoke("mute_user_cmd", { targetPublicKey: pubkey, reason: null }),
              kickUser: (pubkey) => invoke("kick_user_cmd", { targetPublicKey: pubkey, reason: null }),
              banUser: (pubkey) => invoke("ban_user_cmd", { targetPublicKey: pubkey, reason: null }),
              dm: handleUserDm,
              addFriend: handleUserAddFriend,
              toggleBlock: toggleBlockUser,
              toggleIgnore: toggleIgnoreUser,
              fetchPublicProfile: (pubkey) => invoke<PublicHubProfile | null>("fetch_public_profile", {
                hubUrl: hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "",
                pubkey,
              }),
              joinHub: handleDiscoverJoin,
            }}
          />
        )}

        <ScreenShareOverlay
          ref={voice.screenShareViewerRef}
          streams={[...voice.activeScreenShares, ...voice.crossChannelStreams]}
          mediaOutputDeviceId={voice.mediaOutputDeviceId || undefined}
        />

        {voice.showSharePicker && (
          <ScreenShareModal
            onStart={voice.handleShareStart}
            onCancel={() => voice.setShowSharePicker(false)}
          />
        )}

        {encryptionWarning && (
          <div className="modal-overlay">
            <div className="modal encryption-warning-modal">
              <p>{encryptionWarning.message}</p>
              <div className="modal-actions">
                {encryptionWarning.onConfirm && (
                  <button onClick={encryptionWarning.onConfirm}>Send anyway</button>
                )}
                <button onClick={encryptionWarning.onCancel}>
                  {encryptionWarning.onConfirm ? "Cancel" : "Dismiss"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showKeyboardShortcuts && (
          <KeyboardShortcuts onClose={() => setShowKeyboardShortcuts(false)} />
        )}

        {showCreateHub && (
          <CreateHubWizard
            knownFarms={knownFarms}
            onProbeFarm={(farmUrl) => invoke<FarmPublicInfo>("probe_farm", { farmUrl })}
            onGetFarmHubQuota={(farmUrl) => invoke<FarmHubQuota>("get_farm_hub_quota", { farmUrl })}
            onCreateHubOnFarm={(farmUrl, name, description, visibility) =>
              invoke<CreatedFarmHub>("create_hub_on_farm", { farmUrl, name, description, visibility })
            }
            onAddHub={(hubUrl) => invoke<Hub>("add_hub_by_url", { hubUrl })}
            onHubCreated={(hub) => {
              setHubs((prev) => {
                if (prev.some((h) => h.hub_id === hub.hub_id)) return prev;
                return [...prev, hub];
              });
              setActiveHubId(hub.hub_id);
              setShowCreateHub(false);
            }}
            onClose={() => setShowCreateHub(false)}
          />
        )}
      </>
    </div>
  );
}

export default App;
