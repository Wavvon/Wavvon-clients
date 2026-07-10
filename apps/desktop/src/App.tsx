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
  NamedProfile,
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
  TauriFile,
  BotAppLaunchEvent,
  BotAppOpenEvent,
  BotAppCloseEvent,
} from "./types";
import { ScreenShareModal } from "./components/ScreenShareModal";
import { ScreenShareOverlay } from "./components/ScreenShareOverlay";
import { HubStreamsPanel } from "./components/HubStreamsPanel";
import { KeyboardShortcuts } from "@wavvon/ui";
import { useVoice } from "./hooks/useVoice";
import { useVideo } from "./hooks/useVideo";
import { useWhisper } from "./hooks/useWhisper";
import { VideoGrid } from "./components/VideoGrid";
import { type ThemeId, type WavvonSkin, applySkinTokens, clearSkinTokens } from "./skinValidation";
import {
  formatPubkey,
  buildChannelTree,
  flattenTree,
  descendantIds,
  computeDepth,
} from "@wavvon/core";
import { parseHubInput } from "@wavvon/core";
import { saveDraft } from "./utils/drafts";
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
import { ChannelBansModal } from "./components/ChannelBansModal";
import {
  SettingsPage,
  type SettingsTab,
} from "./components/SettingsPage";
import {
  HubAdminPage,
  type HubAdminTab,
} from "./components/HubAdminPage";
import { AddHubModal } from "./components/AddHubModal";
import { FarmSettingsPage, type FarmAdminTab } from "./components/FarmSettingsPage";
import { CreateHubWizard } from "./components/CreateHubWizard";
import { CreateChannelModal } from "./components/CreateChannelModal";
import { FriendsModal } from "./components/FriendsModal";
import { EditDescriptionModal } from "./components/EditDescriptionModal";
import { ChannelContextMenu } from "./components/ChannelContextMenu";
import { ChannelSettingsModal } from "./components/ChannelSettingsModal";
import { ChannelAppearanceModal } from "./components/ChannelAppearanceModal";
import { BannerEditModal } from "./components/BannerEditModal";
import { UserContextMenu } from "./components/UserContextMenu";
import { HubSidebar } from "./components/HubSidebar";
import { ChannelSidebar } from "./components/ChannelSidebar";
import { ContentArea } from "./components/ContentArea";
import { DiscoverPage } from "./components/DiscoverPage";
import { HubBrowser } from "./components/HubBrowser";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { Lobby } from "./components/Lobby";
import { BotChallenge } from "./components/BotChallenge";
import { SurveyComponent } from "./components/Survey";
import { UpdateBanner } from "./components/UpdateBanner";
import { BotAppLaunchCard } from "./components/BotAppLaunchCard";

function App() {
  // Multi-hub state
  const [hubs, setHubs] = useState<Hub[]>([]);
  const hubsRef = useRef<Hub[]>([]);
  useEffect(() => { hubsRef.current = hubs; }, [hubs]);
  const [activeHubId, setActiveHubId] = useState<string | null>(null);
  const [showAddHub, setShowAddHub] = useState(false);
  const [hubScope, setHubScope] = useState<Record<string, "lobby" | "member">>({});
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

  const [dndActive, setDndActive] = useState(false);
  const [userStatus, setUserStatus] = useState<"online" | "away" | "dnd" | "offline">("online");

  function toggleDnd() {
    setDndActive((prev) => {
      invoke("save_dnd_settings", { active: !prev }).catch(() => {});
      return !prev;
    });
  }

  function handleStatusChange(s: "online" | "away" | "dnd" | "offline") {
    setUserStatus(s);
    const nextDnd = s === "dnd";
    if (nextDnd !== dndActive) {
      setDndActive(nextDnd);
      invoke("save_dnd_settings", { active: nextDnd }).catch(() => {});
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

    invoke<boolean>("load_dnd_settings")
      .then((active) => { if (active) setDndActive(true); })
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
    adminRoles,
    adminMembers,
    adminBans,
    adminInvites,
    requireApproval,
    setRequireApproval,
    minSecurityLevel,
    setMinSecurityLevel,
    maxChannelDepth,
    setMaxChannelDepth,
    pendingMembers,
    isAdmin,
    openHubAdmin,
    openHubAdminInvites,
    handleSaveHubBranding,
    refreshPending,
    handleApproveMember,
    refreshRoles,
    handleCreateRole,
    handleUpdateRole,
    handleDeleteRole,
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
    handleToggleRoleAssignment,
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

  async function handleCopyUserKey(u: User) {
    setUserContextMenu(null);
    try {
      await navigator.clipboard.writeText(u.public_key);
      setToast("Public key copied");
    } catch (e) {
      setError(String(e));
    }
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
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "forum" | "category" | "banner">("text");
  const [newBannerUrl, setNewBannerUrl] = useState("");
  const [newBannerSourceMode, setNewBannerSourceMode] = useState<"url" | "upload">("url");
  const [newBannerFile, setNewBannerFile] = useState<File | null>(null);
  const [newChannelParentId, setNewChannelParentId] = useState<string | null>(null);

  // Edit description dialog
  const [editDescriptionChannel, setEditDescriptionChannel] = useState<Channel | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState("");

  const [appearanceChannel, setAppearanceChannel] = useState<Channel | null>(null);
  const [channelSettingsModal, setChannelSettingsModal] = useState<Channel | null>(null);
  const [bannerEditChannel, setBannerEditChannel] = useState<Channel | null>(null);

  // Channel-bans dialog. Stores the channel we're managing bans for so the
  // modal can fetch + mutate without round-tripping through context menu state.
  const [channelBansModal, setChannelBansModal] = useState<
    { channelId: string; channelName: string } | null
  >(null);

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
  const myAvatar = useMemo(
    () => users.find((u) => u.public_key === publicKey)?.avatar ?? null,
    [users, publicKey]
  );
  useEffect(() => {
    myDisplayNameRef.current = myDisplayName;
  }, [myDisplayName]);

  const voice = useVoice({ activeHubId, selectedChannel: channelMessages.selectedChannel, setError, setToast });

  const video = useVideo({
    activeHubId,
    voiceChannelId: voice.voiceChannelId,
    publicKey,
    voiceSpeakingPubkeys: voice.speakingPubkeys,
  });

  const whisper = useWhisper({ activeHubId, voiceChannelId: voice.voiceChannelId });
  const [showWhisperPanel, setShowWhisperPanel] = useState(false);

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
    profiles,
    setProfiles,
    defaultProfileId,
    setDefaultProfileId,
    recoveryPhrase,
    setRecoveryPhrase,
    copiedKey,
    persistProfileFile,
    handleCreateProfile,
    handleUpdateProfile,
    handleDeleteProfile,
    handleSetDefaultProfile,
    handleApplyProfileToHub,
    handleSetTheme,
    handleSkinChange,
    handleShowRecovery,
    handleClearLocalData,
    handleRecoverIdentity,
    handleImportBackup,
    copyPublicKey,
  } = useSettingsProfile({
    hasActiveHub,
    setUsers: (updater) => setUsers(updater),
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
    friends,
    pendingFriends,
    friendRequestKey,
    setFriendRequestKey,
    friendRequestHubUrl,
    setFriendRequestHubUrl,
    refreshFriends,
    openFriends,
    handleSendFriendRequest,
    handleAcceptFriend,
    handleRemoveFriend,
    handleUserAddFriend: handleUserAddFriendFromHook,
  } = useFriends({ setError, setToast });

  const [hideSilenced, setHideSilenced] = useState(false);

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
    // Pre-fill with current display name if known
    // Load profiles + theme
    try {
      const profile = await invoke<{
        profiles?: NamedProfile[];
        default_profile_id?: string | null;
        theme?: string | null;
      }>("get_profile");
      setProfiles(profile.profiles ?? []);
      setDefaultProfileId(profile.default_profile_id ?? null);
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

  async function handleCreateChannel() {
    const name = newChannelName.trim();
    if (!name) return;
    const desc = newChannelDescription.trim();
    try {
      const channel = await invoke<Channel>("create_channel", {
        name,
        parentId: newChannelParentId,
        isCategory: newChannelType === "category",
        channelType: newChannelType === "category" ? undefined : newChannelType,
        description: desc ? desc : null,
        bannerUrl: newChannelType === "banner" && newBannerSourceMode === "url"
          ? (newBannerUrl.trim() || null)
          : null,
      });

      if (newChannelType === "banner" && newBannerSourceMode === "upload" && newBannerFile) {
        const filePath = (newBannerFile as TauriFile).path;
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
      setNewChannelName("");
      setNewChannelDescription("");
      setNewChannelType("text");
      setNewChannelParentId(null);
      setNewBannerUrl("");
      setNewBannerSourceMode("url");
      setNewBannerFile(null);
      setShowCreateChannel(false);
      if (!channel.is_category && channel.channel_type !== "banner") {
        channelMessages.selectChannel(channel);
      }
    } catch (e) {
      setError(String(e));
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

  function openContextMenu(e: React.MouseEvent, channel: Channel) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, channel });
  }

  function openCreateChannelUnder(parentId: string | null) {
    setNewChannelParentId(parentId);
    setNewChannelType("text");
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
            onSave={handleSaveHubBranding}
            pendingMembers={pendingMembers}
            onApproveMember={handleApproveMember}
            roles={adminRoles}
            onCreateRole={handleCreateRole}
            onUpdateRole={handleUpdateRole}
            onDeleteRole={handleDeleteRole}
            members={adminMembers}
            onKickMember={handleKickMember}
            onBanMember={handleBanMember}
            onMuteMember={handleMuteMember}
            onTimeoutMember={handleTimeoutMember}
            onVoiceMuteMember={voice.handleVoiceMuteMember}
            onVoiceUnmuteMember={voice.handleVoiceUnmuteMember}
            voiceMutedKeys={voice.voiceMutedKeys}
            onToggleRoleAssignment={handleToggleRoleAssignment}
            bans={adminBans}
            onUnban={handleUnban}
            invites={adminInvites}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            myPubkey={publicKey ?? ""}
            onCreateInvite={handleCreateInvite}
            onRevokeInvite={handleRevokeInvite}
            channels={channels}
          />
        ) : showSettings ? (
          <SettingsPage
            tab={settingsTab}
            onTab={setSettingsTab}
            onClose={closeSettings}
            hubs={hubs}
            profiles={profiles}
            defaultProfileId={defaultProfileId}
            onCreateProfile={handleCreateProfile}
            onUpdateProfile={handleUpdateProfile}
            onDeleteProfile={handleDeleteProfile}
            onSetDefaultProfile={handleSetDefaultProfile}
            onApplyProfileToHub={handleApplyProfileToHub}
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
            hasActiveHub={hasActiveHub}
            activeHubId={activeHubId}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            publicKey={publicKey}
            copiedKey={copiedKey}
            onCopyKey={() => copyPublicKey(publicKey)}
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
            ) : activeHubId && hubScope[activeHubId] === "lobby" ? (
              <Lobby
                hubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
                hubName={hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? ""}
                onPromoted={() => {
                  setHubScope((prev) => ({ ...prev, [activeHubId]: "member" }));
                  loadHubData();
                  setToast(`You're in. Welcome to ${hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? "the hub"}.`);
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
                  selfMuted={voice.selfMuted}
                  selfDeafened={voice.selfDeafened}
                  users={users}
                  publicKey={publicKey}
                  pingByHub={pingByHub}
                  isAdmin={isAdmin}
                  hubNotifyMode={hubNotifyMode}
                  hubDropdownOpen={hubDropdownOpen}
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
                  onOpenCreateChannel={openCreateChannelUnder}
                  onSelectChannel={channelMessages.selectChannel}
                  onChannelContextMenu={openContextMenu}
                  onOpenChannelSettings={(ch) => setChannelSettingsModal(ch)}
                  onVoiceJoin={voice.handleVoiceJoin}
                  onVoiceLeave={voice.handleVoiceLeave}
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
                  hubStreamsCount={voice.hubStreams.filter((s) => s.kind === "screen").length}
                  onToggleHubStreams={() => setShowHubStreams((v) => !v)}
                  dndActive={userStatus === "dnd"}
                  onToggleDnd={toggleDnd}
                  userStatus={userStatus}
                  onStatusChange={handleStatusChange}
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
                  onVideoToggle={(deviceId) => video.videoEnabled ? video.disableVideo() : video.enableVideo(deviceId)}
                  onCameraDeviceChange={video.switchCamera}
                  onGlobalSearchNavigate={(channelId, _messageId) => {
                    const ch = channels.find((c) => c.id === channelId);
                    if (ch) channelMessages.selectChannel(ch);
                  }}
                />
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
                  theme={theme}
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
                  voiceChannelId={voice.voiceChannelId}
                  onVoiceJoin={() => voice.handleVoiceJoin()}
                  onVoiceLeave={() => { voice.handleVoiceLeave(); setAssertiveAnnouncement("Left voice"); }}
                  myAvatar={myAvatar}
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
                  sharing={voice.sharing}
                  shareKbps={voice.shareKbps}
                  onStopShare={voice.stopShare}
                  assertiveAnnouncement={assertiveAnnouncement}
                />
                {showHubStreams && (
                  <div style={{ position: "relative" }}>
                    <HubStreamsPanel
                      streams={voice.hubStreams}
                      subscribedIds={voice.subscribedStreamIds.current}
                      currentChannelId={channelMessages.selectedChannel?.id ?? null}
                      onSubscribe={voice.subscribeToStream}
                      onUnsubscribe={voice.unsubscribeFromStream}
                      onClose={() => setShowHubStreams(false)}
                    />
                  </div>
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

        {showCreateChannel && (
          <CreateChannelModal
            name={newChannelName}
            onNameChange={setNewChannelName}
            description={newChannelDescription}
            onDescriptionChange={setNewChannelDescription}
            channelType={newChannelType}
            onChannelTypeChange={setNewChannelType}
            bannerUrl={newBannerUrl}
            onBannerUrlChange={setNewBannerUrl}
            bannerSourceMode={newBannerSourceMode}
            onBannerSourceModeChange={setNewBannerSourceMode}
            bannerFile={newBannerFile}
            onBannerFileChange={setNewBannerFile}
            parentId={newChannelParentId}
            onCreate={handleCreateChannel}
            onClose={() => setShowCreateChannel(false)}
          />
        )}

        {showFriends && (
          <FriendsModal
            friends={friends}
            pendingFriends={pendingFriends}
            requestKey={friendRequestKey}
            onRequestKeyChange={setFriendRequestKey}
            requestHubUrl={friendRequestHubUrl}
            onRequestHubUrlChange={setFriendRequestHubUrl}
            onSendRequest={handleSendFriendRequest}
            onAcceptFriend={handleAcceptFriend}
            onMessage={startDmWithAndClose}
            onRemoveFriend={handleRemoveFriend}
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
            isAdmin={isAdmin}
            onSaveAppearance={(icon, color, svg) => handleSaveAppearance(channelSettingsModal, icon, color, svg)}
            onSaveDescription={async (desc) => {
              try {
                await invoke("update_channel_description", { channelId: channelSettingsModal.id, description: desc ? desc : null });
                setChannels(prev => prev.map(c => c.id === channelSettingsModal.id ? { ...c, description: desc ? desc : null } : c));
                const sel = channelMessages.selectedChannel;
                if (sel?.id === channelSettingsModal.id) {
                  channelMessages.selectChannel({ ...sel, description: desc ? desc : null });
                }
              } catch (e) { setError(String(e)); }
            }}
            onManageBans={() => setChannelBansModal({ channelId: channelSettingsModal.id, channelName: channelSettingsModal.name })}
            onClose={() => setChannelSettingsModal(null)}
          />
        )}

        {channelBansModal && (
          <ChannelBansModal
            channelId={channelBansModal.channelId}
            channelName={channelBansModal.channelName}
            users={users}
            onClose={() => setChannelBansModal(null)}
            onError={setError}
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
            menu={userContextMenu}
            publicKey={publicKey}
            blockedUsers={blockedUsers}
            ignoredUsers={ignoredUsers}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            onClose={() => setUserContextMenu(null)}
            onDm={handleUserDm}
            onAddFriend={handleUserAddFriend}
            onCopyKey={handleCopyUserKey}
            onToggleBlock={toggleBlockUser}
            onToggleIgnore={toggleIgnoreUser}
            onToast={setToast}
            onJoinHub={handleDiscoverJoin}
            allRoles={isAdmin ? adminRoles : undefined}
            memberRoleIds={isAdmin
              ? new Set(
                  adminMembers
                    .find((m) => m.public_key === userContextMenu.user.public_key)
                    ?.roles.map((r) => r.id) ?? []
                )
              : undefined}
            onToggleRole={isAdmin
              ? (roleId, hasRole) => handleToggleRoleAssignment(userContextMenu.user.public_key, roleId, hasRole)
              : undefined}
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
