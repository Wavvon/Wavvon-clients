// App.tsx — Root component
//
// React concepts for Blazor devs:
// - useState(initial) returns [value, setter] — private field + setter
// - useEffect(fn, [deps]) runs fn when deps change — like OnParametersSet
// - useRef(initial) persists a value across renders — like a field that doesn't trigger re-render
// - Event handlers use camelCase: onClick, onChange, onSubmit

import React, { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
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
  DmMessageFull,
  AllianceInfo,
  AllianceSharedChannel,
  ActiveStream,
  LobbyStatus,
  SurveySubmitResult,
  BotAdminInfo,
  BotDetailInfo,
  InstalledGame,
} from "./types";
import { ScreenShareModal } from "./components/ScreenShareModal";
import { ScreenShareOverlay } from "./components/ScreenShareOverlay";
import { HubStreamsPanel } from "./components/HubStreamsPanel";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { useVoice } from "./hooks/useVoice";
import { useVideo } from "./hooks/useVideo";
import { useWhisper } from "./hooks/useWhisper";
import { VideoGrid } from "./components/VideoGrid";
import { MAX_ATTACHMENT_BYTES } from "./constants";
import { type ThemeId, type VoxplySkin, applySkinTokens, clearSkinTokens } from "./skinValidation";
import { formatPubkey, mentionsName, newProfileId } from "./utils/format";
import { playMentionPing } from "./utils/audio";
import { readFileAsB64 } from "./utils/files";
import { saveDraft, loadDraft, clearDraft } from "./utils/drafts";
import { buildChannelTree, flattenTree, descendantIds, computeDepth } from "./utils/channels";
import { useNotificationPrefs } from "./hooks/useNotificationPrefs";
import { useUnreadCounts } from "./hooks/useUnreadCounts";
import { useTypingIndicators } from "./hooks/useTypingIndicators";
import { useHubConnections } from "./hooks/useHubConnections";
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

  // Conversation unread set. In-memory only -- DMs always come back to view
  // through the conversation list, so persisting per-launch isn't worth the
  // complexity yet.
  const [unreadDms, setUnreadDms] = useState<Record<string, boolean>>({});

  const {
    hubNotifyMode,
    channelNotifyMode,
    setHubMode,
    setChannelMode,
  } = useNotificationPrefs();

  // Blocked users: pubkey set. Persisted to ~/.voxply/blocked_users.json so
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
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  // Attachments staged for the next outgoing message. Cleared on send/cancel.
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  // Message we're currently replying to. Null means a top-level message.
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);

  const selectedChannelForTypingRef = useRef<Channel | null>(null);
  useEffect(() => { selectedChannelForTypingRef.current = selectedChannel; }, [selectedChannel]);
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

  // Per-channel search. When a query is active, the message list is
  // replaced by search results (newest-first) until the user clears it.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K quick-switcher palette.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // Whether the right-side member list is collapsed. Local-only preference;
  // localStorage is fine since it's purely cosmetic + per-device.
  const [memberSidebarHidden, setMemberSidebarHiddenState] = useState<boolean>(
    () => {
      try {
        return localStorage.getItem("voxply.memberSidebarHidden") === "1";
      } catch {
        return false;
      }
    },
  );
  function setMemberSidebarHidden(v: boolean) {
    setMemberSidebarHiddenState(v);
    try {
      localStorage.setItem("voxply.memberSidebarHidden", v ? "1" : "0");
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

  const [encryptionWarning, setEncryptionWarning] = useState<{
    message: string;
    onConfirm?: () => void;
    onCancel: () => void;
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
    if (u.public_key === publicKey) return;
    try {
      await invoke("send_friend_request", { targetPublicKey: u.public_key });
      setToast(`Friend request sent to ${u.display_name || formatPubkey(u.public_key)}`);
    } catch (e) {
      setError(String(e));
    }
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

  // Alliance sidebar state. We surface every alliance the active hub belongs
  // to plus the channels each member shares with it. Selecting a remote one
  // routes message reads through /alliances/.../messages on our hub.
  const [userAlliances, setUserAlliances] = useState<AllianceInfo[]>([]);
  const [allianceChannels, setAllianceChannels] = useState<
    Record<string, AllianceSharedChannel[]>
  >({});
  const [selectedAllianceChannel, setSelectedAllianceChannel] = useState<{
    alliance_id: string;
    alliance_name: string;
    channel: AllianceSharedChannel;
  } | null>(null);
  const [allianceMessages, setAllianceMessages] = useState<Message[]>([]);

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

  // Channel-bans dialog. Stores the channel we're managing bans for so the
  // modal can fetch + mutate without round-tripping through context menu state.
  const [channelBansModal, setChannelBansModal] = useState<
    { channelId: string; channelName: string } | null
  >(null);

  // Hub admin panel
  const [hubDropdownOpen, setHubDropdownOpen] = useState(false);
  const [showHubAdmin, setShowHubAdmin] = useState(false);
  const [hubAdminTab, setHubAdminTab] = useState<HubAdminTab>("overview");
  const [myRoles, setMyRoles] = useState<RoleInfo[]>([]);
  // "pending" means the active hub requires admin approval and our user
  // record hasn't been approved yet. We render a landing page in that case
  // instead of the empty channel list, so the user knows what's going on.
  const [myApprovalStatus, setMyApprovalStatus] = useState<
    "approved" | "pending" | "unknown"
  >("unknown");
  const [adminHubName, setAdminHubName] = useState("");
  const [adminHubDescription, setAdminHubDescription] = useState("");
  const [adminHubIcon, setAdminHubIcon] = useState("");

  // Role editor
  const [adminRoles, setAdminRoles] = useState<RoleInfo[]>([]);

  // Member admin
  const [adminMembers, setAdminMembers] = useState<MemberAdminInfo[]>([]);

  // Ban admin
  const [adminBans, setAdminBans] = useState<BanInfo[]>([]);

  // Invite admin
  const [adminInvites, setAdminInvites] = useState<InviteInfo[]>([]);

  // Approval queue + hub-wide flags
  const [requireApproval, setRequireApproval] = useState(false);
  const [minSecurityLevel, setMinSecurityLevel] = useState(0);
  const [maxChannelDepth, setMaxChannelDepth] = useState(0);
  const [showHubStreams, setShowHubStreams] = useState(false);
  const [pendingMembers, setPendingMembers] = useState<PendingUser[]>([]);

  const isAdmin = myRoles.some((r) => r.permissions.includes("admin"));

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
  const myDisplayNameRef = useRef<string | null>(null);
  useEffect(() => {
    myDisplayNameRef.current = myDisplayName;
  }, [myDisplayName]);

  const voice = useVoice({ activeHubId, selectedChannel, setError, setToast });

  const video = useVideo({
    activeHubId,
    voiceChannelId: voice.voiceChannelId,
    publicKey,
    voiceSpeakingPubkeys: voice.speakingPubkeys,
  });

  const whisper = useWhisper({ activeHubId, voiceChannelId: voice.voiceChannelId });
  const [showWhisperPanel, setShowWhisperPanel] = useState(false);

  const [showBgPicker, setShowBgPicker] = useState(false);

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

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showHubBrowser, setShowHubBrowser] = useState(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try {
      return localStorage.getItem("voxply.seenWelcome") !== "1";
    } catch {
      return true;
    }
  });
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [theme, setTheme] = useState<ThemeId>("calm");
  const [skin, setSkin] = useState<VoxplySkin | null>(null);
  const [profiles, setProfiles] = useState<NamedProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Whether to play the mention ping. Local-only preference; OS notifications
  // and unread badges are unaffected by this toggle.
  const [mentionPingEnabled, setMentionPingEnabledState] = useState<boolean>(
    () => {
      try {
        return localStorage.getItem("voxply.mentionPing") !== "0";
      } catch {
        return true;
      }
    },
  );
  function setMentionPingEnabled(v: boolean) {
    setMentionPingEnabledState(v);
    try {
      localStorage.setItem("voxply.mentionPing", v ? "1" : "0");
    } catch {}
  }
  const mentionPingRef = useRef(mentionPingEnabled);
  useEffect(() => {
    mentionPingRef.current = mentionPingEnabled;
  }, [mentionPingEnabled]);

  type PendingNotifEntry = {
    hubName: string;
    channels: Map<string, { name: string; count: number; isMention: boolean }>;
    timer: ReturnType<typeof setTimeout>;
  };
  const pendingNotifsRef = useRef<Map<string, PendingNotifEntry>>(new Map());

  function flushNotif(hubId: string) {
    const entry = pendingNotifsRef.current.get(hubId);
    if (!entry) return;
    pendingNotifsRef.current.delete(hubId);
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const channelList = [...entry.channels.values()];
    const totalCount = channelList.reduce((n, c) => n + c.count, 0);
    const hasMention = channelList.some((c) => c.isMention);

    let title: string;
    let body: string;
    if (channelList.length === 1) {
      const ch = channelList[0];
      title = hasMention ? `Mentioned in #${ch.name}` : `New messages in #${ch.name}`;
      body = `${totalCount} new message${totalCount > 1 ? "s" : ""} in ${entry.hubName}`;
    } else {
      const names = channelList.map((c) => `#${c.name}`).join(", ");
      title = hasMention ? `Mentions in ${entry.hubName}` : `New messages in ${entry.hubName}`;
      body = `${totalCount} new message${totalCount > 1 ? "s" : ""} in ${names}`;
    }

    try { new Notification(title, { body }); } catch {}
  }

  function queueNotif(hubId: string, hubName: string, channelId: string, channelName: string, isMention: boolean) {
    const map = pendingNotifsRef.current;
    const existing = map.get(hubId);
    if (existing) {
      clearTimeout(existing.timer);
      const ch = existing.channels.get(channelId);
      if (ch) {
        ch.count += 1;
        ch.isMention = ch.isMention || isMention;
      } else {
        existing.channels.set(channelId, { name: channelName, count: 1, isMention });
      }
      existing.timer = setTimeout(() => flushNotif(hubId), 3000);
    } else {
      const channels = new Map<string, { name: string; count: number; isMention: boolean }>();
      channels.set(channelId, { name: channelName, count: 1, isMention });
      map.set(hubId, {
        hubName,
        channels,
        timer: setTimeout(() => flushNotif(hubId), 3000),
      });
    }
  }

  // Friends
  const [showFriends, setShowFriends] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingFriends, setPendingFriends] = useState<Friend[]>([]);
  const [friendRequestKey, setFriendRequestKey] = useState("");
  // Optional hub URL field — when filled, the friend is treated as cross-hub
  // and the friendship is created already-accepted (no federated request flow yet).
  const [friendRequestHubUrl, setFriendRequestHubUrl] = useState("");

  const [hideSilenced, setHideSilenced] = useState(false);

  // DMs
  const [view, setView] = useState<"channels" | "dms">("channels");
  // Mirror current view in a ref so window-level event listeners can read
  // the latest value without re-registering on every state change.
  const viewRef = useRef<typeof view>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [dmMessages, setDmMessages] = useState<Record<string, DmMessage[]>>({});
  const selectedConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id ?? null;
    selectedConversationForTypingRef.current = selectedConversation;
  }, [selectedConversation]);

  // Ref to the messages container for auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesEndChannelRef = useRef<HTMLLIElement>(null);
  const messagesContainerRef = useRef<HTMLOListElement>(null);
  // Ref to the channel-message input so we can auto-focus on channel switch
  // and after sending. Lets the user start typing immediately without
  // clicking back into the field.
  const messageInputRef = useRef<HTMLInputElement>(null);
  // Tracks whether the user is parked near the bottom of the message list.
  // We only auto-scroll on new messages while this is true; otherwise the
  // user is reading history and scrolling them is rude. The "↓ N new" pill
  // counts new messages they've missed so they can jump down explicitly.
  const [stickToBottom, setStickToBottom] = useState(true);
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    stickToBottomRef.current = stickToBottom;
  }, [stickToBottom]);
  const [newWhileScrolledUp, setNewWhileScrolledUp] = useState(0);

  // Ref to the currently selected channel ID (for the event listener closure).
  // Why a ref? Because event listeners capture the state at time of setup — using
  // a ref ensures we always read the latest value without re-registering the listener.
  const selectedChannelIdRef = useRef<string | null>(null);

  // Auto-scroll only when the user is already near the bottom. Using a
  // 120px threshold matches the natural "I'm reading the latest" zone --
  // tighter than that and a slightly-up scroll would still re-anchor.
  useEffect(() => {
    if (stickToBottom) {
      (messagesEndChannelRef.current ?? messagesEndRef.current)?.scrollIntoView({ behavior: "smooth" });
      setNewWhileScrolledUp(0);
    } else {
      setNewWhileScrolledUp((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Reset on channel switch -- user starts fresh at the bottom.
  useEffect(() => {
    setStickToBottom(true);
    setNewWhileScrolledUp(0);
    // Auto-focus the message input so the user can start typing immediately.
    // Small delay lets the new channel render first.
    if (selectedChannel) {
      setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  }, [selectedChannel?.id]);

  function handleMessagesScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 120;
    if (atBottom !== stickToBottom) setStickToBottom(atBottom);
    if (atBottom && newWhileScrolledUp > 0) setNewWhileScrolledUp(0);
    if (atBottom && activeHubId && selectedChannel) {
      clearFirstNotify(activeHubId, selectedChannel.id);
    }
  }

  function jumpToBottom() {
    const el = messagesContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setStickToBottom(true);
    setNewWhileScrolledUp(0);
  }

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);



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

  // Load data for whichever admin tab the user opens
  useEffect(() => {
    if (!showHubAdmin) return;
    if (hubAdminTab === "roles") {
      refreshRoles();
    } else if (hubAdminTab === "members") {
      refreshRoles(); // roles list used for the assign-role dropdown
      refreshMembers();
      refreshPending();
      voice.refreshVoiceMutes();
    } else if (hubAdminTab === "bans") {
      refreshBans();
    } else if (hubAdminTab === "invites") {
      refreshInvites();
    }
  }, [showHubAdmin, hubAdminTab]);

  async function copyPublicKey() {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch (e) {
      setError("Failed to copy: " + e);
    }
  }

  // Surface any error as a toast so the user actually sees it
  // (we removed the always-visible connect screen that used to render it).
  useEffect(() => {
    if (error) setToast(error);
  }, [error]);

  // Keep the ref in sync with the state
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null;
  }, [selectedChannel]);

  // Listen for real-time chat messages from the Rust backend.
  // This runs once when the component mounts.
  useEffect(() => {
    const unlistens: UnlistenFn[] = [];

    (async () => {
      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; message: Message }>(
          "chat-message",
          (event) => {
            const { hub_id, channel_id, message } = event.payload;

            // Permission gate: drop messages for channels the client hasn't
            // listed. Guards deleted/race-condition channels today; will guard
            // per-channel ACLs when those land.
            if (!channelsRef.current.some((c) => c.id === channel_id)) return;

            const isActiveHub = hub_id === activeHubIdRef.current;
            const isActiveChannel =
              isActiveHub && channel_id === selectedChannelIdRef.current;
            const myName = myDisplayNameRef.current;
            const isMention =
              !!myName &&
              message.sender !== publicKeyRef.current &&
              mentionsName(message.content, myName);

            const mode = effectiveNotifyMode(hub_id, channel_id);
            const allowBump =
              mode === "all" || (mode === "mentions" && isMention);

            if (isActiveChannel) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === message.id)) return prev;
                return [...prev, message];
              });
            } else if (allowBump) {
              bumpUnread(hub_id, channel_id);
              setFirstNotify(hub_id, channel_id, message.id);
            }

            // Notification (audio + OS): fires when the message would pin AND
            // the channel isn't currently visible AND either it's a @mention
            // or mode is "all" and the app window doesn't have focus.
            const shouldNotify =
              allowBump &&
              !isActiveChannel &&
              (isMention || (mode === "all" && !document.hasFocus()));

            if (shouldNotify) {
              if (mentionPingRef.current) playMentionPing();
              const channelName =
                channelsRef.current.find((c) => c.id === channel_id)?.name ?? channel_id;
              const hubEntry = hubsRef.current.find((h) => h.hub_id === hub_id);
              const hubName = hubEntry?.hub_name ?? hub_id;
              queueNotif(hub_id, hubName, channel_id, channelName, isMention);
            }
          }
        )
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; message: Message }>(
          "chat-message-edited",
          (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            if (event.payload.channel_id !== selectedChannelIdRef.current) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === event.payload.message.id ? event.payload.message : m
              )
            );
          }
        )
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; message_id: string }>(
          "chat-message-deleted",
          (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            if (event.payload.channel_id !== selectedChannelIdRef.current) return;
            setMessages((prev) =>
              prev.filter((m) => m.id !== event.payload.message_id)
            );
          }
        )
      );

      unlistens.push(
        await listen<{ hub_id: string; connected: boolean }>(
          "hub-ws-status",
          (event) => {
            const { hub_id, connected } = event.payload;
            setHubConnected((prev) => {
              const was = prev[hub_id];
              const next = { ...prev, [hub_id]: connected };
              if (hub_id === activeHubIdRef.current) {
                const hubName = hubs.find((h) => h.hub_id === hub_id)?.hub_name ?? "hub";
                if (connected && was === false) {
                  setToast("Reconnected");
                  setAssertiveAnnouncement(`Reconnected to ${hubName}.`);
                } else if (!connected && was !== false) {
                  setAssertiveAnnouncement(`Disconnected from ${hubName}. Reconnecting…`);
                }
              }
              return next;
            });
            if (connected) {
              onHubReconnected(hub_id);
            } else {
              scheduleReconnect(hub_id);
            }
          }
        )
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          conversation_id: string;
          sender: string;
          sender_name: string | null;
          typing: boolean;
        }>("dm-typing", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          // Only show when the user is actually viewing this conversation.
          if (
            event.payload.conversation_id !==
            selectedConversationIdRef.current
          )
            return;
          if (event.payload.sender === publicKeyRef.current) return;
          const name =
            event.payload.sender_name || formatPubkey(event.payload.sender);
          if (event.payload.typing) {
            setDmTypingEntry(event.payload.sender, name);
          } else {
            clearDmTypingEntry(event.payload.sender);
          }
        }),
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          conversation_id: string;
          added: string[];
          removed: string[];
        }>("dm-member-changed", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const myKey = publicKeyRef.current;
          if (myKey && event.payload.removed.includes(myKey)) {
            // I was removed — clear selection if viewing this conversation.
            if (selectedConversationIdRef.current === event.payload.conversation_id) {
              setSelectedConversation(null);
            }
          }
          // Refresh conversation list so membership changes are visible.
          void loadConversations();
          // Rotate sender key on any membership change to prevent removed
          // members from decrypting future messages.
          void invoke("rotate_group_sender_key", {
            convId: event.payload.conversation_id,
          }).catch(() => {});
        }),
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          channel_id: string;
          public_key: string;
          display_name: string | null;
          typing: boolean;
        }>("chat-typing", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          if (event.payload.channel_id !== selectedChannelIdRef.current) return;
          if (event.payload.public_key === publicKeyRef.current) return;
          const name =
            event.payload.display_name ||
            formatPubkey(event.payload.public_key);
          if (event.payload.typing) {
            setTypingEntry(event.payload.public_key, name);
          } else {
            clearTypingEntry(event.payload.public_key);
          }
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          channel_id: string;
          message_id: string;
          reactions: { emoji: string; count: number; me: boolean }[];
        }>("chat-reactions-updated", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          if (event.payload.channel_id !== selectedChannelIdRef.current) return;
          // The server can't know per-recipient `me` for broadcasts, so it
          // sends `me: false`. We patch our own flag locally based on the
          // existing message reactions before the update.
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== event.payload.message_id) return m;
              const myEmojis = new Set(
                (m.reactions ?? []).filter((r) => r.me).map((r) => r.emoji)
              );
              return {
                ...m,
                reactions: event.payload.reactions.map((r) => ({
                  ...r,
                  me: myEmojis.has(r.emoji),
                })),
              };
            })
          );
        })
      );

      unlistens.push(
        await listen<{
          hub_id: string;
          channel_id: string;
          hub_udp_port: number;
          participants: VoiceParticipant[];
        }>("voice-joined", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          voice.onVoiceJoined(event.payload.channel_id, event.payload.participants);
          const channelName = channelsRef.current.find((c) => c.id === event.payload.channel_id)?.name ?? event.payload.channel_id;
          const others = event.payload.participants.filter((p) => p.public_key !== publicKeyRef.current);
          if (others.length === 0) {
            setAssertiveAnnouncement(`Joined voice in ${channelName}.`);
          } else {
            const names = others.map((p) => p.display_name || formatPubkey(p.public_key)).join(", ");
            setAssertiveAnnouncement(`Joined voice in ${channelName} with ${others.length} other ${others.length === 1 ? "participant" : "participants"}: ${names}`);
          }
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; participant: VoiceParticipant }>(
          "voice-participant-joined",
          (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            voice.onParticipantJoined(event.payload.channel_id, event.payload.participant);
            if (event.payload.participant.public_key !== publicKeyRef.current) {
              const name = event.payload.participant.display_name || formatPubkey(event.payload.participant.public_key);
              pendingVoiceAnnouncementsRef.current.push(`${name} joined voice`);
              if (!voiceAnnounceTimerRef.current) {
                voiceAnnounceTimerRef.current = setTimeout(() => {
                  const batch = pendingVoiceAnnouncementsRef.current.splice(0);
                  setVoicePoliteAnnouncement(batch.join(". "));
                  voiceAnnounceTimerRef.current = null;
                }, 2000);
              }
            }
          }
        )
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; public_key: string }>(
          "voice-participant-left",
          (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            voice.onParticipantLeft(event.payload.channel_id, event.payload.public_key);
            if (event.payload.public_key !== publicKeyRef.current) {
              const u = users.find((u) => u.public_key === event.payload.public_key);
              const name = u?.display_name || formatPubkey(event.payload.public_key);
              pendingVoiceAnnouncementsRef.current.push(`${name} left voice`);
              if (!voiceAnnounceTimerRef.current) {
                voiceAnnounceTimerRef.current = setTimeout(() => {
                  const batch = pendingVoiceAnnouncementsRef.current.splice(0);
                  setVoicePoliteAnnouncement(batch.join(". "));
                  voiceAnnounceTimerRef.current = null;
                }, 2000);
              }
            }
          }
        )
      );

      unlistens.push(
        await listen<number>("mic-level", (event) => {
          voice.onMicLevel(event.payload);
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; context: string; message: string }>(
          "hub-error",
          async (event) => {
            if (event.payload.hub_id !== activeHubIdRef.current) return;
            setToast(event.payload.message);
            if (event.payload.context === "voice_join") {
              await voice.onHubErrorVoiceJoin();
            }
          }
        )
      );


      unlistens.push(
        await listen<DmMessage & { hub_id: string; conversation_id: string }>("dm", (event) => {
          if (event.payload.hub_id !== activeHubIdRef.current) return;
          const { conversation_id, hub_id: _, ...msg } = event.payload;
          setDmMessages((prev) => {
            const list = prev[conversation_id] || [];
            return { ...prev, [conversation_id]: [...list, msg] };
          });
          // Mark this conversation unread unless the user is currently
          // viewing it (in DM view AND it's the selected conversation).
          const lookingHere =
            viewRef.current === "dms" &&
            selectedConversationIdRef.current === conversation_id;
          if (!lookingHere && msg.sender !== publicKeyRef.current) {
            setUnreadDms((prev) => ({ ...prev, [conversation_id]: true }));
          }
          const conv = conversationsRef.current.find((c) => c.id === conversation_id);
          if (conv?.conv_type === "group" && msg.sender !== publicKeyRef.current) {
            invoke("fetch_group_sender_keys", { convId: conversation_id })
              .then(() => invoke<DmMessageFull[]>("get_dm_messages", { conversationId: conversation_id }))
              .then((history) => {
                setDmMessages((prev) => ({
                  ...prev,
                  [conversation_id]: history.map((m) => ({
                    id: m.id,
                    sender: m.sender,
                    sender_name: m.sender_name,
                    content: m.content,
                    timestamp: m.created_at,
                    attachments: m.attachments,
                    is_encrypted: m.is_encrypted,
                  })),
                }));
              })
              .catch(() => {});
          }
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; hub_name: string }>("hub-session-lost", async (event) => {
          const { hub_name } = event.payload;
          // Don't auto-remove the hub — that was overly destructive on
          // transient failures (hub briefly offline, network blip, hub
          // restart with brief auth window). The auto-reconnect loop
          // handles real recoveries; if the user has actually been banned
          // they'll see persistent failures and can remove the hub
          // manually from its context menu.
          setToast(
            `Couldn't authenticate with "${hub_name}". The hub may be offline, or you may have been banned. Use Reconnect to retry, or right-click to remove.`
          );
        })
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; post_id: string }>(
          "post-created",
          (event) => {
            const { hub_id, channel_id } = event.payload;
            if (!channelsRef.current.some((c) => c.id === channel_id)) return;
            const mode = effectiveNotifyMode(hub_id, channel_id);
            if (mode !== "silent" && hub_id !== activeHubIdRef.current || channel_id !== selectedChannelIdRef.current) {
              bumpUnread(hub_id, channel_id);
            }
          }
        )
      );

      unlistens.push(
        await listen<{ hub_id: string; channel_id: string; post_id: string }>(
          "reply-created",
          (event) => {
            const { hub_id, channel_id } = event.payload;
            if (!channelsRef.current.some((c) => c.id === channel_id)) return;
            const mode = effectiveNotifyMode(hub_id, channel_id);
            if (mode !== "silent" && (hub_id !== activeHubIdRef.current || channel_id !== selectedChannelIdRef.current)) {
              bumpUnread(hub_id, channel_id);
            }
          }
        )
      );
    })();

    return () => {
      unlistens.forEach((u) => u());
      // Cancel any pending auto-reconnect timers so they don't fire
      // against an unmounted component (matters in dev / HMR).
      cancelAllReconnectTimers();
    };
  }, []);

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
        setSelectedChannel(null);
        setSelectedConversation(null);
        setSelectedAllianceChannel(null);
        setMessages([]);
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
      try {
        const games = await invoke<InstalledGame[]>("list_games");
        setInstalledGames(games);
      } catch {
        setInstalledGames([]);
      }
      // Reset selection when switching hub
      setSelectedChannel(null);
      setSelectedConversation(null);
      setSelectedAllianceChannel(null);
      setAllianceMessages([]);
      setMessages([]);
      // Pull alliances + their shared channels for the sidebar
      try {
        const al = await invoke<AllianceInfo[]>("list_alliances");
        setUserAlliances(al);
        const byId: Record<string, AllianceSharedChannel[]> = {};
        await Promise.all(
          al.map(async (a) => {
            try {
              byId[a.id] = await invoke<AllianceSharedChannel[]>(
                "list_alliance_shared_channels",
                { allianceId: a.id }
              );
            } catch {
              byId[a.id] = [];
            }
          })
        );
        setAllianceChannels(byId);
      } catch {
        setUserAlliances([]);
        setAllianceChannels({});
      }
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

  async function openHubAdmin() {
    setHubDropdownOpen(false);
    setShowHubAdmin(true);
    setHubAdminTab("overview");
    try {
      const branding = await invoke<{
        name: string;
        description: string | null;
        icon: string | null;
      }>("get_hub_branding");
      setAdminHubName(branding.name);
      setAdminHubDescription(branding.description ?? "");
      setAdminHubIcon(branding.icon ?? "");

      const settings = await invoke<{
        require_approval: boolean;
        invite_only: boolean;
        min_security_level: number;
        max_channel_depth: number;
      }>("get_hub_settings");
      setRequireApproval(settings.require_approval);
      setMinSecurityLevel(settings.min_security_level ?? 0);
      setMaxChannelDepth(settings.max_channel_depth ?? 0);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveHubBranding() {
    try {
      await invoke("update_hub_branding", {
        name: adminHubName.trim() || null,
        description: adminHubDescription,
        icon: adminHubIcon,
        requireApproval: requireApproval,
        minSecurityLevel: minSecurityLevel,
        maxChannelDepth: maxChannelDepth,
      });
      // Refresh hub list so the new name flows into the hub-icon title
      const refreshed = await invoke<Hub[]>("list_hubs");
      setHubs(refreshed);
      setToast("Hub settings saved");
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshPending() {
    try {
      const p = await invoke<PendingUser[]>("list_pending_members");
      setPendingMembers(p);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleApproveMember(publicKey: string) {
    try {
      await invoke("approve_member", { targetPublicKey: publicKey });
      setToast("Member approved");
      await refreshPending();
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshRoles() {
    try {
      const r = await invoke<RoleInfo[]>("list_roles");
      setAdminRoles(r);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateRole(
    name: string,
    permissions: string[],
    priority: number,
    displaySeparately: boolean
  ) {
    try {
      await invoke("create_role", {
        name,
        permissions,
        priority,
        displaySeparately,
      });
      await refreshRoles();
      setToast("Role created");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUpdateRole(
    roleId: string,
    updates: {
      name?: string;
      permissions?: string[];
      priority?: number;
      display_separately?: boolean;
    }
  ) {
    try {
      await invoke("update_role", {
        roleId,
        name: updates.name ?? null,
        permissions: updates.permissions ?? null,
        priority: updates.priority ?? null,
        displaySeparately: updates.display_separately ?? null,
      });
      await refreshRoles();
      setToast("Role updated");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteRole(roleId: string) {
    if (!confirm("Delete this role? Users assigned to it will lose the role.")) return;
    try {
      await invoke("delete_role", { roleId });
      await refreshRoles();
      setToast("Role deleted");
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshMembers() {
    try {
      const m = await invoke<MemberAdminInfo[]>("list_hub_members");
      setAdminMembers(m);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleKickMember(publicKey: string) {
    const reason = prompt("Reason for kick (optional)") ?? "";
    try {
      await invoke("kick_user_cmd", {
        targetPublicKey: publicKey,
        reason: reason.trim() || null,
      });
      setToast("Kicked");
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleBanMember(publicKey: string) {
    const reason = prompt("Reason for ban (optional)") ?? "";
    if (!confirm("Ban this user? They won't be able to rejoin.")) return;
    try {
      await invoke("ban_user_cmd", {
        targetPublicKey: publicKey,
        reason: reason.trim() || null,
      });
      setToast("Banned");
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleMuteMember(publicKey: string) {
    const reason = prompt("Reason for mute (optional)") ?? "";
    try {
      await invoke("mute_user_cmd", {
        targetPublicKey: publicKey,
        reason: reason.trim() || null,
      });
      setToast("Muted");
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleTimeoutMember(publicKey: string) {
    const durationStr = prompt(
      "Timeout duration in minutes (1-1440)",
      "10"
    );
    if (!durationStr) return;
    const minutes = Number(durationStr);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      setError("Invalid duration");
      return;
    }
    const reason = prompt("Reason (optional)") ?? "";
    try {
      await invoke("timeout_user_cmd", {
        targetPublicKey: publicKey,
        durationSeconds: Math.floor(minutes * 60),
        reason: reason.trim() || null,
      });
      setToast(`Timed out for ${minutes}m`);
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshBans() {
    try {
      const b = await invoke<BanInfo[]>("list_bans");
      setAdminBans(b);
    } catch (e) {
      setError(String(e));
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

  async function handleUnban(publicKey: string) {
    if (!confirm("Unban this user? They'll be able to rejoin.")) return;
    try {
      await invoke("unban_user", { targetPublicKey: publicKey });
      setToast("Unbanned");
      await refreshBans();
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshInvites() {
    try {
      const i = await invoke<InviteInfo[]>("list_invites");
      setAdminInvites(i);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateInvite(
    maxUses: number | null,
    expiresInSeconds: number | null
  ) {
    try {
      await invoke<InviteInfo>("create_invite", {
        maxUses,
        expiresInSeconds,
      });
      await refreshInvites();
      setToast("Invite created");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRevokeInvite(code: string) {
    if (!confirm(`Revoke invite ${code}?`)) return;
    try {
      await invoke("revoke_invite", { code });
      await refreshInvites();
      setToast("Invite revoked");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleToggleRoleAssignment(
    publicKey: string,
    roleId: string,
    hasRole: boolean
  ) {
    try {
      if (hasRole) {
        await invoke("unassign_role", {
          targetPublicKey: publicKey,
          roleId,
        });
      } else {
        await invoke("assign_role", {
          targetPublicKey: publicKey,
          roleId,
        });
      }
      await refreshMembers();
    } catch (e) {
      setError(String(e));
    }
  }

  // Normalise whatever the user typed/pasted/deep-linked into a proper
  // hub URL + optional invite code.
  function parseHubInput(raw: string): { hubUrl: string; inviteCode: string } | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("voxply://")) {
      const rest = trimmed.slice("voxply://".length);
      const slashIdx = rest.indexOf("/");
      const hostPart = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      const codePart = slashIdx === -1 ? "" : rest.slice(slashIdx + 1).split("?")[0];
      if (!hostPart) return null;
      const isLocal = hostPart.startsWith("localhost") || hostPart.startsWith("127.");
      return { hubUrl: `${isLocal ? "http" : "https"}://${hostPart}`, inviteCode: codePart };
    }
    if (/^https?:\/\//i.test(trimmed)) return { hubUrl: trimmed, inviteCode: "" };
    // Plain hostname — normalise to https (http for localhost/loopback)
    const isLocal = trimmed.startsWith("localhost") || trimmed.startsWith("127.");
    return { hubUrl: `${isLocal ? "http" : "https"}://${trimmed}`, inviteCode: "" };
  }

  function handleHubUrlChange(v: string) {
    setHubUrl(v);
    const parsed = parseHubInput(v);
    if (parsed?.inviteCode) setInviteCode(parsed.inviteCode);
  }

  // On mount: check whether the app was launched via a voxply:// deep link,
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
    const unlisten = listen<string>("join-hub-requested", (event) => {
      const parsed = parseHubInput(event.payload);
      if (parsed) {
        setHubUrl(parsed.hubUrl);
        setInviteCode(parsed.inviteCode);
        setShowAddHub(true);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes: string | null } | null>(null);
  useEffect(() => {
    const unlisten = listen<{ version: string; notes: string | null }>("update-available", (ev) => {
      setUpdateInfo(ev.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
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
        const appearance = await invoke<{ slot: string; skin?: VoxplySkin | null }>("load_appearance");
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
    if (selectedChannel) return;
    if (channels.length === 0) return;
    // Skip categories and banner channels — pick the first interactive leaf.
    const firstLeaf = channels.find((c) => !c.is_category && c.channel_type !== "banner");
    if (firstLeaf) {
      selectChannel(firstLeaf);
    }
    // selectChannel is stable in scope but eslint can't prove that;
    // listing it would re-trigger every render. Channels is the real
    // signal we want to watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, selectedChannel]);

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

  // Run search whenever the query or selected channel changes. Empty query
  // clears the results panel so the regular message list comes back.
  useEffect(() => {
    if (!selectedChannel) {
      setSearchResults(null);
      return;
    }
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const r = await invoke<Message[]>("search_messages", {
          channelId: selectedChannel.id,
          query: q,
        });
        if (!cancelled) setSearchResults(r);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, selectedChannel]);

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults(null);
  }

  async function selectChannel(channel: Channel) {
    // Unsubscribe from previous channel's WS updates
    if (selectedChannel && selectedChannel.id !== channel.id) {
      await invoke("unsubscribe_channel", { channelId: selectedChannel.id });
    }

    // Leaving alliance-channel mode
    setSelectedAllianceChannel(null);
    setAllianceMessages([]);
    // Reset any in-flight search when switching channels.
    closeSearch();

    setSelectedChannel(channel);
    setMessages([]);
    clearAllTyping();
    if (activeHubId) {
      clearUnread(activeHubId, channel.id);
      setInputText(loadDraft(`${activeHubId}/${channel.id}`));
    } else {
      setInputText("");
    }
    try {
      const msgs = await invoke<Message[]>("get_messages", {
        channelId: channel.id,
      });
      setMessages(msgs);

      // Subscribe to real-time updates for this channel
      await invoke("subscribe_channel", { channelId: channel.id });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSendAllianceMessage() {
    if (!selectedAllianceChannel) return;
    const content = inputText.trim();
    if (!content) return;
    try {
      await invoke("send_alliance_channel_message", {
        allianceId: selectedAllianceChannel.alliance_id,
        channelId: selectedAllianceChannel.channel.channel_id,
        content,
      });
      setInputText("");
      // Refetch since we don't subscribe to remote alliance channels yet --
      // there's no WS push for federated messages.
      try {
        const msgs = await invoke<Message[]>("get_alliance_channel_messages", {
          allianceId: selectedAllianceChannel.alliance_id,
          channelId: selectedAllianceChannel.channel.channel_id,
        });
        setAllianceMessages(msgs);
      } catch {}
    } catch (e) {
      setError(String(e));
    }
  }

  async function selectAllianceChannel(
    alliance: AllianceInfo,
    ch: AllianceSharedChannel
  ) {
    // If the alliance channel is one of OUR local channels, route through the
    // normal selectChannel flow so subscriptions and posting just work.
    const localMatch = channels.find((c) => c.id === ch.channel_id);
    if (localMatch) {
      await selectChannel(localMatch);
      return;
    }

    if (selectedChannel) {
      await invoke("unsubscribe_channel", { channelId: selectedChannel.id });
      setSelectedChannel(null);
    }

    setSelectedAllianceChannel({
      alliance_id: alliance.id,
      alliance_name: alliance.name,
      channel: ch,
    });
    setAllianceMessages([]);
    try {
      const msgs = await invoke<Message[]>("get_alliance_channel_messages", {
        allianceId: alliance.id,
        channelId: ch.channel_id,
      });
      setAllianceMessages(msgs);
    } catch (e) {
      setError(String(e));
    }
  }

  function startEditingMessage(m: Message) {
    setEditingMessageId(m.id);
    setEditingDraft(m.content);
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingDraft("");
  }

  async function handleSaveEditedMessage() {
    if (!editingMessageId || !selectedChannel) return;
    const content = editingDraft.trim();
    if (!content) return;
    try {
      const updated = await invoke<Message>("edit_message", {
        channelId: selectedChannel.id,
        messageId: editingMessageId,
        content,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      cancelEditingMessage();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!selectedChannel) return;
    if (!confirm("Delete this message?")) return;
    try {
      await invoke("delete_message", {
        channelId: selectedChannel.id,
        messageId,
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!selectedChannel) return;
    // Optimistic update so the click feels instant; the WS broadcast will
    // reconcile if there's drift.
    let optimisticMine = false;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions ? [...m.reactions] : [];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx === -1) {
          reactions.push({ emoji, count: 1, me: true });
          optimisticMine = true;
        } else {
          const r = reactions[idx];
          if (r.me) {
            const next = { ...r, count: r.count - 1, me: false };
            if (next.count <= 0) reactions.splice(idx, 1);
            else reactions[idx] = next;
          } else {
            reactions[idx] = { ...r, count: r.count + 1, me: true };
            optimisticMine = true;
          }
        }
        return { ...m, reactions };
      })
    );
    try {
      if (optimisticMine) {
        await invoke("add_reaction", {
          channelId: selectedChannel.id,
          messageId,
          emoji,
        });
      } else {
        await invoke("remove_reaction", {
          channelId: selectedChannel.id,
          messageId,
          emoji,
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSend() {
    if (!selectedChannel) return;
    const content = inputText;
    const attachments = pendingAttachments;
    const reply = replyTarget;
    if (!content.trim() && attachments.length === 0) return;
    setInputText("");
    if (activeHubId) clearDraft(`${activeHubId}/${selectedChannel.id}`);
    setPendingAttachments([]);
    setReplyTarget(null);
    try {
      const msg = await invoke<Message>("send_message", {
        channelId: selectedChannel.id,
        content,
        attachments,
        replyTo: reply?.id ?? null,
      });
      // Dedup: the WebSocket may have already added this message
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch (e) {
      setError(String(e));
      // Restore the user's draft on failure.
      setInputText(content);
      setPendingAttachments(attachments);
      setReplyTarget(reply);
    }
  }

  /** Scroll the message with the given id into view and briefly flash it. */
  function scrollToMessage(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  }

  /** Read a File into a base64 string (no data: prefix). */
  async function attachFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: Attachment[] = [...pendingAttachments];
    let totalBytes = next.reduce((n, a) => n + a.data_b64.length, 0);
    for (const f of Array.from(files)) {
      try {
        const b64 = await readFileAsB64(f);
        if (totalBytes + b64.length > MAX_ATTACHMENT_BYTES) {
          setError(
            `Attachments would exceed 3MB cap (already at ${(totalBytes / 1_000_000).toFixed(1)}MB)`
          );
          break;
        }
        totalBytes += b64.length;
        next.push({
          name: f.name,
          mime: f.type || "application/octet-stream",
          data_b64: b64,
        });
      } catch (e) {
        setError(String(e));
      }
    }
    setPendingAttachments(next);
  }

  // Handle Enter key in input
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }


  /** Persist the full LocalProfile to disk. Pass the parts you want to change;
   *  current state is used for the rest. */
  async function persistProfileFile(overrides: {
    profiles?: NamedProfile[];
    defaultProfileId?: string | null;
    theme?: "calm" | "classic" | "linear" | "light";
  } = {}) {
    const next = {
      profiles: overrides.profiles ?? profiles,
      default_profile_id: overrides.defaultProfileId ?? defaultProfileId,
      theme: overrides.theme ?? theme,
    };
    try {
      await invoke("save_profile", { profile: next });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateProfile() {
    const fresh: NamedProfile = {
      id: newProfileId(),
      label: `Profile ${profiles.length + 1}`,
      display_name: "",
      avatar: null,
    };
    const next = [...profiles, fresh];
    setProfiles(next);
    // First profile created becomes the default automatically.
    const nextDefault = profiles.length === 0 ? fresh.id : defaultProfileId;
    if (nextDefault !== defaultProfileId) setDefaultProfileId(nextDefault);
    await persistProfileFile({ profiles: next, defaultProfileId: nextDefault });
  }

  async function handleUpdateProfile(
    id: string,
    patch: Partial<Omit<NamedProfile, "id">>
  ) {
    const next = profiles.map((p) =>
      p.id === id ? { ...p, ...patch } : p
    );
    setProfiles(next);
    await persistProfileFile({ profiles: next });
  }

  async function handleDeleteProfile(id: string) {
    if (profiles.length <= 1) {
      setError("You need at least one profile.");
      return;
    }
    if (!confirm("Delete this profile?")) return;
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    let nextDefault = defaultProfileId;
    if (defaultProfileId === id) {
      nextDefault = next[0]?.id ?? null;
      setDefaultProfileId(nextDefault);
    }
    await persistProfileFile({ profiles: next, defaultProfileId: nextDefault });
  }

  async function handleSetDefaultProfile(id: string) {
    setDefaultProfileId(id);
    await persistProfileFile({ defaultProfileId: id });
    setToast("Default profile updated");
  }

  async function handleApplyProfileToHub(id: string) {
    if (!hasActiveHub) return;
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    try {
      if (p.display_name.trim()) {
        await invoke("update_display_name", { displayName: p.display_name });
      }
      await invoke("update_avatar", { avatar: p.avatar ?? "" });
      const u = await invoke<User[]>("list_users");
      setUsers(u);
      setToast(`Applied "${p.label}" to this hub`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSetTheme(t: ThemeId) {
    if (t !== "custom") {
      clearSkinTokens();
      setSkin(null);
      document.documentElement.dataset.theme = t;
      await persistProfileFile({ theme: t });
    }
    setTheme(t);
    if (t !== "custom") {
      await invoke("save_appearance", { settings: { slot: t, skin: null } }).catch(() => {});
    }
  }

  async function handleSkinChange(s: VoxplySkin) {
    setSkin(s);
    document.documentElement.dataset.theme = s.base;
    applySkinTokens(s);
    setTheme("custom");
    await invoke("save_appearance", { settings: { slot: "custom", skin: s } }).catch(() => {});
  }

  async function handleShowRecovery() {
    try {
      const phrase = await invoke<string>("get_recovery_phrase");
      setRecoveryPhrase(phrase);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleClearLocalData() {
    const ok = confirm(
      "Clear local preferences?\n\nThis wipes unread, mutes, pinned channels, collapsed categories, voice settings, and recently-used emojis.\n\nYour identity and saved hubs are kept.",
    );
    if (!ok) return;
    const confirm2 = confirm("Are you sure? This can't be undone.");
    if (!confirm2) return;
    try {
      await invoke("clear_local_data");
      // localStorage flags too -- those live in the webview, not on disk
      // via Tauri.
      try {
        localStorage.removeItem("voxply.recentEmojis");
        localStorage.removeItem("voxply.memberSidebarHidden");
        localStorage.removeItem("voxply.mentionPing");
      } catch {}
      setToast("Local data cleared — reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRecoverIdentity(phrase: string) {
    try {
      const newPubkey = await invoke<string>("recover_identity_from_phrase", {
        phrase,
      });
      // The backend already cleared hub sessions and the saved-hubs file.
      // Reloading is the cleanest way to reset every piece of in-memory
      // state (active hub, channels, messages, voice, friends, etc.) without
      // hand-resetting twenty pieces of React state.
      setRecoveryPhrase(null);
      setPublicKey(newPubkey);
      setToast("Identity restored — reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }

  async function handleImportBackup() {
    const passphrase = window.prompt("Enter the backup passphrase:");
    if (passphrase === null) return;
    try {
      await invoke("import_identity_backup", { passphrase });
      setToast("Identity restored from backup — reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadConversations() {
    try {
      const c = await invoke<Conversation[]>("list_conversations");
      setConversations(c);
    } catch (e) {
      setError(String(e));
    }
  }

  async function selectConversation(conv: Conversation) {
    setSelectedConversation(conv);
    selectedConversationForTypingRef.current = conv;
    clearAllDmTyping();
    setUnreadDms((prev) => {
      if (!prev[conv.id]) return prev;
      const { [conv.id]: _, ...rest } = prev;
      return rest;
    });
    try {
      const history = await invoke<DmMessageFull[]>("get_dm_messages", {
        conversationId: conv.id,
      });
      setDmMessages((prev) => ({
        ...prev,
        [conv.id]: history.map((m) => ({
          id: m.id,
          sender: m.sender,
          sender_name: m.sender_name,
          content: m.content,
          timestamp: m.created_at,
          attachments: m.attachments,
          delivery_failed: m.delivery_failed,
        })),
      }));
    } catch (e) {
      setError(String(e));
    }
  }

  async function startDmWith(targetKey: string, targetHubUrl?: string | null) {
    try {
      const memberHubs: Record<string, string> = {};
      if (targetHubUrl) memberHubs[targetKey] = targetHubUrl;
      const conv = await invoke<Conversation>("create_conversation", {
        members: [targetKey],
        memberHubs,
      });
      // Make sure it's in the list
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [...prev, conv];
      });
      await selectConversation(conv);
      setView("dms");
      setShowFriends(false);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSendDm() {
    if (!selectedConversation) return;
    const content = inputText;
    const attachments = pendingAttachments;
    if (!content.trim() && attachments.length === 0) return;

    const doSend = async (encryptedEnvelope?: object, groupEncryptedEnvelope?: object) => {
      setInputText("");
      setPendingAttachments([]);
      try {
        await invoke("send_dm", {
          conversationId: selectedConversation.id,
          content: (encryptedEnvelope || groupEncryptedEnvelope) ? undefined : content,
          attachments: attachments.length > 0 ? attachments : undefined,
          encryptedEnvelope,
          groupEncryptedEnvelope,
        });
        setDmMessages((prev) => {
          const list = prev[selectedConversation.id] || [];
          return {
            ...prev,
            [selectedConversation.id]: [
              ...list,
              {
                sender: publicKey || "",
                sender_name: null,
                content,
                timestamp: Math.floor(Date.now() / 1000),
                attachments,
                is_encrypted: !!encryptedEnvelope,
              },
            ],
          };
        });
      } catch (e) {
        setError(String(e));
      }
    };

    if (selectedConversation.conv_type === "group") {
      try {
        const groupEnv = await invoke<object>("encrypt_group_dm", {
          convId: selectedConversation.id,
          content,
        });
        await doSend(undefined, groupEnv);
      } catch (e) {
        if (String(e).includes("no_sender_key")) {
          try {
            await invoke("push_group_sender_key", { convId: selectedConversation.id });
            const groupEnv = await invoke<object>("encrypt_group_dm", {
              convId: selectedConversation.id,
              content,
            });
            await doSend(undefined, groupEnv);
          } catch {
            setEncryptionWarning({
              message: "Encryption failed. The message was not sent.",
              onCancel: () => setEncryptionWarning(null),
            });
          }
        } else {
          setEncryptionWarning({
            message: "Encryption failed. The message was not sent.",
            onCancel: () => setEncryptionWarning(null),
          });
        }
      }
      return;
    }

    const otherKey = selectedConversation.members.find((k) => k !== publicKey);
    if (!otherKey) { await doSend(); return; }

    const activeHub = hubs.find((h) => h.is_active);
    if (!activeHub) { await doSend(); return; }

    try {
      const dhPubkey = await invoke<string | null>("fetch_dh_key", {
        pubkey: otherKey,
        hubUrl: activeHub.hub_url,
      });

      if (!dhPubkey) {
        setEncryptionWarning({
          message: "This recipient hasn't published an encryption key. This message will not be encrypted.",
          onConfirm: async () => {
            setEncryptionWarning(null);
            await doSend();
          },
          onCancel: () => setEncryptionWarning(null),
        });
        return;
      }

      const envelope = await invoke<object>("encrypt_dm", {
        convId: selectedConversation.id,
        content,
        recipientDhPubkeyHex: dhPubkey,
      });
      await doSend(envelope);
    } catch {
      setEncryptionWarning({
        message: "Encryption failed. The message was not sent.",
        onCancel: () => setEncryptionWarning(null),
      });
    }
  }

  async function refreshFriends() {
    try {
      const f = await invoke<Friend[]>("list_friends");
      const p = await invoke<Friend[]>("list_pending_friends");
      setFriends(f);
      setPendingFriends(p);
    } catch (e) {
      setError(String(e));
    }
  }

  async function openFriends() {
    setShowFriends(true);
    await refreshFriends();
  }

  async function handleSendFriendRequest() {
    const key = friendRequestKey.trim();
    if (!key) return;
    const url = friendRequestHubUrl.trim();
    try {
      await invoke("send_friend_request", {
        targetPublicKey: key,
        friendHubUrl: url ? url : null,
        displayName: null,
      });
      setFriendRequestKey("");
      setFriendRequestHubUrl("");
      await refreshFriends();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleAcceptFriend(fromKey: string) {
    try {
      await invoke("accept_friend", { fromPublicKey: fromKey });
      await refreshFriends();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveFriend(targetKey: string) {
    try {
      await invoke("remove_friend", { targetPublicKey: targetKey });
      await refreshFriends();
    } catch (e) {
      setError(String(e));
    }
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
      localStorage.setItem("voxply.seenWelcome", "1");
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
      if (selectedChannel?.id === channel.id) {
        setSelectedChannel({ ...selectedChannel, name: trimmed });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function openHubAdminInvites() {
    await openHubAdmin();
    setHubAdminTab("invites");
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
        const filePath = (newBannerFile as any).path as string | undefined;
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
        selectChannel(channel);
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
      if (selectedChannel?.id === editDescriptionChannel.id) {
        setSelectedChannel({ ...selectedChannel, description: desc ? desc : null });
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
      if (selectedChannel?.id === channelId) {
        setSelectedChannel(null);
        setMessages([]);
      }
      setContextMenu(null);
    } catch (e) {
      setError(String(e));
    }
  }

  function handleEditAppearance(channel: Channel) {
    setAppearanceChannel(channel);
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
        } else if (selectedChannel && !selectedChannel.is_category) {
          voice.handleVoiceJoin(selectedChannel);
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
            const idx = selectedChannel
              ? unreadChannels.findIndex((c) => c.id === selectedChannel.id)
              : -1;
            const prev = idx > 0 ? unreadChannels[idx - 1] : unreadChannels[unreadChannels.length - 1];
            selectChannel(prev);
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
            const idx = selectedChannel
              ? unreadChannels.findIndex((c) => c.id === selectedChannel.id)
              : -1;
            const next = idx >= 0 && idx < unreadChannels.length - 1
              ? unreadChannels[idx + 1]
              : unreadChannels[0];
            selectChannel(next);
          }
        }
        return;
      }

      if (meta && e.key.toLowerCase() === "f" && !inText) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (e.key === "/" && !inText && !meta) {
        e.preventDefault();
        messageInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        if (contextMenu) { setContextMenu(null); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (replyTarget) { setReplyTarget(null); return; }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hubs, activeHubId, selectedChannel, channels, view, voice, unreadByChannel, contextMenu, paletteOpen, replyTarget]);

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
            hasActiveHub={hasActiveHub}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            publicKey={publicKey}
            copiedKey={copiedKey}
            onCopyKey={copyPublicKey}
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
            mentionPingEnabled={mentionPingEnabled}
            onMentionPingChange={setMentionPingEnabled}
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
                  selectedChannel={selectedChannel}
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
                  selectedAllianceChannel={selectedAllianceChannel}
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
                  onOpenHubAdmin={openHubAdmin}
                  onOpenHubAdminInvites={openHubAdminInvites}
                  onOpenCreateChannel={openCreateChannelUnder}
                  onSelectChannel={selectChannel}
                  onChannelContextMenu={openContextMenu}
                  onOpenChannelSettings={(ch) => setChannelSettingsModal(ch)}
                  onVoiceJoin={voice.handleVoiceJoin}
                  onVoiceLeave={voice.handleVoiceLeave}
                  onSelectAllianceChannel={selectAllianceChannel}
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
                  onVideoToggle={() => video.videoEnabled ? video.disableVideo() : video.enableVideo()}
                  backgroundMode={video.backgroundMode}
                  showBgPicker={showBgPicker}
                  onShowBgPickerChange={setShowBgPicker}
                  onChangeBackground={video.changeBackground}
                  onGlobalSearchNavigate={(channelId, _messageId) => {
                    const ch = channels.find((c) => c.id === channelId);
                    if (ch) selectChannel(ch);
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
                <ContentArea
                  view={view}
                  activeHubId={activeHubId}
                  hubs={hubs}
                  theme={theme}
                  selectedChannel={selectedChannel}
                  selectedConversation={selectedConversation}
                  selectedAllianceChannel={selectedAllianceChannel}
                  messages={messages}
                  searchResults={searchResults}
                  searchOpen={searchOpen}
                  searchQuery={searchQuery}
                  dmMessages={dmMessages}
                  allianceMessages={allianceMessages}
                  users={users}
                  publicKey={publicKey}
                  blockedUsers={blockedUsers}
                  ignoredUsers={ignoredUsers}
                  knownDisplayNames={knownDisplayNames}
                  myDisplayName={myDisplayName}
                  isAdmin={isAdmin}
                  myRoles={myRoles}
                  editingMessageId={editingMessageId}
                  editingDraft={editingDraft}
                  replyTarget={replyTarget}
                  pendingAttachments={pendingAttachments}
                  stickToBottom={stickToBottom}
                  newWhileScrolledUp={newWhileScrolledUp}
                  hubConnected={hubConnected}
                  reconnectingHubs={reconnectingHubs}
                  memberSidebarHidden={memberSidebarHidden}
                  voiceActiveUsers={voice.voiceActiveUsers}
                  voiceChannelId={voice.voiceChannelId}
                  onVoiceJoin={() => voice.handleVoiceJoin()}
                  onVoiceLeave={() => { voice.handleVoiceLeave(); setAssertiveAnnouncement("Left voice"); }}
                  installedGames={installedGames}
                  myAvatar={myAvatar}
                  inputText={inputText}
                  typingByKey={typingByKey}
                  dmTypingByKey={dmTypingByKey}
                  messagesEndRef={messagesEndRef}
                  messagesEndChannelRef={messagesEndChannelRef}
                  messagesContainerRef={messagesContainerRef}
                  messageInputRef={messageInputRef}
                  onReconnect={handleReconnect}
                  onToggleReaction={toggleReaction}
                  onSetReplyTarget={setReplyTarget}
                  onSaveEdit={handleSaveEditedMessage}
                  onCancelEdit={cancelEditingMessage}
                  onStartEdit={startEditingMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onSend={handleSend}
                  onSendDm={handleSendDm}
                  onSendAllianceMessage={handleSendAllianceMessage}
                  onPingTyping={pingTyping}
                  onPingDmTyping={pingDmTyping}
                  onSetPendingAttachments={setPendingAttachments}
                  onAttachFiles={attachFiles}
                  onOpenEditDescription={openEditDescription}
                  firstNotifyingMessageId={
                    activeHubId && selectedChannel
                      ? (firstNotifyId[activeHubId]?.[selectedChannel.id] ?? null)
                      : null
                  }
                  onClearFirstNotify={() => {
                    if (activeHubId && selectedChannel)
                      clearFirstNotify(activeHubId, selectedChannel.id);
                  }}
                  onScrollToMessage={scrollToMessage}
                  onSetMemberSidebarHidden={setMemberSidebarHidden}
                  onSetSearchOpen={setSearchOpen}
                  onSetSearchQuery={setSearchQuery}
                  onCloseSearch={closeSearch}
                  onJumpToBottom={jumpToBottom}
                  onMessagesScroll={handleMessagesScroll}
                  onSetUserContextMenu={setUserContextMenu}
                  onSetEditingDraft={setEditingDraft}
                  onInputTextChange={(v) => {
                    setInputText(v);
                    if (activeHubId && selectedChannel) saveDraft(`${activeHubId}/${selectedChannel.id}`, v);
                  }}
                  onKeyDown={handleKeyDown}
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
                      currentChannelId={selectedChannel?.id ?? null}
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
            onMessage={startDmWith}
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

        {channelSettingsModal && (
          <ChannelSettingsModal
            channel={channelSettingsModal}
            isAdmin={isAdmin}
            onSaveAppearance={(icon, color, svg) => handleSaveAppearance(channelSettingsModal, icon, color, svg)}
            onSaveDescription={async (desc) => {
              try {
                await invoke("update_channel_description", { channelId: channelSettingsModal.id, description: desc ? desc : null });
                setChannels(prev => prev.map(c => c.id === channelSettingsModal.id ? { ...c, description: desc ? desc : null } : c));
                if (selectedChannel?.id === channelSettingsModal.id) {
                  setSelectedChannel({ ...selectedChannel, description: desc ? desc : null });
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
            onSelect={(c) => { setPaletteOpen(false); selectChannel(c); }}
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
