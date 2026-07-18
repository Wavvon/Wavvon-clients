import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useUnreadCounts } from "./hooks/useUnreadCounts";
import { useNotificationPrefs } from "./hooks/useNotificationPrefs";
import { useTypingIndicators } from "./hooks/useTypingIndicators";
import { useSoundboardChips } from "./hooks/useSoundboardChips";
import { useHubConnection } from "./hooks/useHubConnection";
import { useHubAdmin } from "./hooks/useHubAdmin";
import { useAlliances } from "./hooks/useAlliances";
import { useSettingsProfile } from "./hooks/useSettingsProfile";
import { useFarmAdmin } from "./hooks/useFarmAdmin";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { flattenTree, descendantIds, computeDepth, mentionsName, playMentionPing, playVoiceTone, channelPath, formatPubkey } from "@wavvon/core";
import { getScoped, setScoped } from "./utils/accountScope";

// Voice join/leave sound cues, gated by a preference (default on). Per
// account — it's a notification-style preference, like the mention ping.
function voiceSoundsOn(): boolean {
  try { return getScoped("wavvon.voiceSounds") !== "0"; } catch { return true; }
}
import { DISCOVERY_NEW_HUB_URL, HUB_SETUP_COMMAND } from "./constants";
import { parseHubInput } from "@wavvon/core";
import type { HubInputResult } from "@wavvon/core";
import type {
  Channel,
  Attachment,
  Message,
  NotifyMode,
  User,
  VoiceParticipant,
  Hub,
  MeInfo,
  Conversation,
  DmMessage,
  AllianceInfo,
  AllianceSharedChannel,
  SoundboardClip,
} from "@shared/types";
import type { ActiveStream, BotAppLaunchEvent, BotAppOpenEvent, PresenceStatus } from "./types";
import { BotMiniAppFrame } from "@components/bots/BotMiniAppFrame";
import { HubSidebar } from "@components/layout/HubSidebar";
import { ChannelSidebar } from "@components/layout/ChannelSidebar";
import { ContentArea } from "@components/layout/ContentArea";
import { WhisperBar } from "@components/voice/WhisperBar";
import { loadPttConfig } from "@components/settings/PushToTalkSection";
import { loadDefaultProfile, saveDefaultProfile, type DefaultProfile } from "./utils/profiles";
import { getCurrentSurvey, isLobbyScopeConfined, connectHubWebSocket } from "@platform";
import { SurveyModal } from "@components/polls/SurveyModal";
import { Lobby } from "@components/layout/Lobby";
import { HubStreamsPanel } from "@components/voice/HubStreamsPanel";
import type { HubStreamInfo } from "./types";
import { AddHubModal } from "@components/hubs/AddHubModal";
import { QuickInviteModal } from "@components/hubs/QuickInviteModal";
import { CreateChannelModal } from "@components/channels/CreateChannelModal";
import { EventComposer } from "@components/events/EventComposer";
import { PollComposer } from "@components/polls/PollComposer";
import { ChannelSettingsModal } from "@components/channels/ChannelSettingsModal";
import { FarmSettingsPage } from "@components/admin/FarmSettingsPage";
import { CreateHubFork } from "@components/hubs/CreateHubFork";
import { BotAppLaunchCard, FocusTrap, KeyboardShortcuts, HoverSubmenu, VoiceMoveMenu, VoiceMoveToast, VoiceMovePromptModal } from "@wavvon/ui";
import { moveChannelOptions, decideVoiceMove } from "./utils/voiceMove";
import { HubAdminPage } from "@components/admin/HubAdminPage";
import { SearchBar } from "@components/layout/SearchBar";
import { WelcomeScreenContainer } from "@components/layout/WelcomeScreen";
import { SettingsPage } from "@components/settings/SettingsPage";
import { UserContextMenu } from "@components/users/UserContextMenu";
import { VideoPipWindow } from "@components/voice/VideoPipWindow";
import { FriendsModal } from "@components/users/FriendsModal";
import { MobileShell } from "@components/layout/MobileShell";
import { DiscoverPage } from "@components/hubs/DiscoverPage";
import { buildChannelTree } from "@wavvon/core";
import type { TreeNode } from "@wavvon/core";
import { saveDraft, loadDraft, clearDraft } from "./utils/drafts";
import type { ScreenShareViewerRef } from "@components/voice/ScreenShareViewer";
import { ScreenShareSelfPreview } from "@components/voice/ScreenShareSelfPreview";
import { listBotCommands, updateDmBlocks, getDmBlocks, fetchVoiceRoster, activeSession, authenticateWithPasskey } from "@platform";
import { markSoundboardPlayed, fetchSoundboardAudioBytes, getMyChannelPermissions, sendSetStatus, sendSetStatusTo, uploadFile } from "@platform";
import type { MyChannelPermissions } from "@platform";
import {
  restorePersistedHubs,
  addHub,
  removeHub,
  setActiveHub,
  listHubs,
  renameSavedHub,
  previewHubInfo,
  reorderHubs,
  reauthorizeHub,
  hubFetch,
  HubApiError,
  loadSavedHubs,
} from "@platform";
import type { WsHandlers } from "@platform";
import { getActiveHubId } from "@platform";
import { VoiceWsSession, type AudioProfileConfig } from "./platform/voice";
import { WebScreenShareSession } from "./platform/screenShare";
import { WebVideoSession } from "./platform/video";
import { BackgroundProcessor, loadBgMode, loadBgSource } from "./utils/backgroundProcessor";

// The voice audio profile is persisted by SettingsPage under this key; read
// it here so the saved profile is actually applied to the live session.
function loadVoiceAudioProfile(): AudioProfileConfig | undefined {
  try {
    const raw = localStorage.getItem("wavvon.audio_profile");
    if (raw) return JSON.parse(raw) as AudioProfileConfig;
  } catch { /* fall back to session defaults */ }
  return undefined;
}
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  searchMessages,
  getUnreadCounts,
  markChannelRead,
  subscribeChannel,
} from "@platform";
import {
  getDmMessages,
  sendDm,
  publishDhKey,
  createConversation,
} from "@platform";
import { loadIdentity, publicKeyHex, setSwitchGuard } from "@identity/index";
import { IdentitySetupScreen, type IdentitySetupCompletion } from "@components/identity/IdentitySetupScreen";

// ---- Types ----
type View = "channels" | "dms";
type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number; welcome_label?: string | null; welcome_invite_url?: string | null }
  | { state: "error"; message: string };

// ---- App ----

export interface AppProps {
  // Set by AccountRoot right after an in-place account switch initiated from
  // Settings → Account, so the user lands back there on the new account
  // instead of the main view.
  initialView?: "settings-account";
}

export default function App({ initialView }: AppProps = {}) {
  const { t } = useTranslation();
  // === Identity ===
  const [ready, setReady] = useState<"checking" | "setup" | "ok">("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const {
    showSettings, setShowSettings,
    settingsTab, setSettingsTab,
    theme,
    skin,
    customThemes,
    activeCustomThemeId,
    recoveryPhrase, setRecoveryPhrase,
    mentionPingEnabled, setMentionPingEnabled,
    handleSetTheme,
    handleSkinChange,
    handleApplyCustomTheme,
    handleNewCustomTheme,
    handleRenameCustomTheme,
    handleDuplicateCustomTheme,
    handleDeleteCustomTheme,
    handleImportCustomTheme,
    handleShowRecovery,
    handleRecoverIdentity,
  } = useSettingsProfile(setPublicKey, initialView);

  // === Hubs ===
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [activeHubId, setActiveHubIdState] = useState<string | null>(null);
  const { hubConnected, reconnectingHubs, handleStatusChange } = useHubConnection();
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const [voicePoliteAnnouncement, setVoicePoliteAnnouncement] = useState("");
  const voiceAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVoiceAnnouncementsRef = useRef<string[]>([]);
  const [pingByHub, setPingByHub] = useState<Record<string, number | null>>({});
  const [hubDropdownOpen, setHubDropdownOpen] = useState(false);
  const [hubUrl, setHubUrl] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hubPreview, setHubPreview] = useState<HubPreview>({ state: "idle" });
  const [addingHub, setAddingHub] = useState(false);
  const [addHubError, setAddHubError] = useState<string | null>(null);
  const [showAddHub, setShowAddHub] = useState(false);
  const [showQuickInvite, setShowQuickInvite] = useState(false);
  const [homeHubUrl, setHomeHubUrl] = useState<string | undefined>(undefined);
  const [createChannelCtx, setCreateChannelCtx] = useState<{ parentId: string | null; isCategory: boolean } | null>(null);
  const [createChannelLoading, setCreateChannelLoading] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [channelCtxMenu, setChannelCtxMenu] = useState<{ channel: Channel; x: number; y: number } | null>(null);
  const [channelSettingsCtx, setChannelSettingsCtx] = useState<Channel | null>(null);
  // "Create event"/"create poll" from the channel context menu (create-anything
  // task): both composers are self-contained modals that only need a target
  // channel id, so they can be opened without switching to that channel first.
  const [eventComposerChannelId, setEventComposerChannelId] = useState<string | null>(null);
  const [pollComposerChannelId, setPollComposerChannelId] = useState<string | null>(null);
  // Temp-room owner rename (temp-voice-channels.md §3): a non-admin owner
  // gets a minimal rename modal, not the full channel-settings surface.
  const [renameRoomCtx, setRenameRoomCtx] = useState<Channel | null>(null);
  const [renameRoomName, setRenameRoomName] = useState("");
  const [renameRoomSaving, setRenameRoomSaving] = useState(false);
  const [renameRoomError, setRenameRoomError] = useState<string | null>(null);
  const [channelSettingsSaving, setChannelSettingsSaving] = useState(false);
  const [channelSettingsDeleting, setChannelSettingsDeleting] = useState(false);
  const [channelSettingsError, setChannelSettingsError] = useState<string | null>(null);

  // === Hub data ===
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  // Own presence — shared across every hub this account is on, not per-hub;
  // the client is the source of truth and broadcasts it to every session,
  // re-applying on (re)connect. Distinct from hub mute (notify modes). It's
  // an account-level preference (per-account storage), not a device-global one.
  const [myPresence, setMyPresenceState] = useState<{ status: PresenceStatus }>(() => {
    try {
      const raw = getScoped("wavvon.presence");
      if (raw) {
        const p = JSON.parse(raw) as { status?: string };
        const s = p.status;
        if (s === "away" || s === "dnd" || s === "invisible") return { status: s };
      }
    } catch { /* storage unavailable or corrupt */ }
    return { status: "online" };
  });
  const setMyPresence = useCallback((p: { status: PresenceStatus }) => {
    setMyPresenceState(p);
    try { setScoped("wavvon.presence", JSON.stringify(p)); } catch { /* storage unavailable */ }
  }, []);
  // Timer backing the presence "clear after" (TTL): while connected, reverts
  // to Online when it fires. Presence is online-only anyway, so disconnecting
  // also naturally resets it; this just handles the still-online case.
  const presenceTtlRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [meInfo, setMeInfo] = useState<MeInfo | null>(null);
  const [voicePartByChannel, setVoicePartByChannel] = useState<Record<string, VoiceParticipant[]>>({});
  const [voiceActiveUsers, setVoiceActiveUsers] = useState<Set<string>>(new Set());
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [selfMuted, setSelfMuted] = useState(false);
  const [selfDeafened, setSelfDeafened] = useState(false);
  const voiceSessionRef = useRef<VoiceWsSession | null>(null);
  const [voiceGains, setVoiceGains] = useState<Record<string, number>>(() => {
    try { return JSON.parse(getScoped("wavvon.voice_gains") || "{}") as Record<string, number>; }
    catch { return {}; }
  });
  const [slashCommands, setSlashCommands] = useState<Array<{ command: string; description: string; bot_name: string }>>([]);
  const {
    userAlliances, setUserAlliances, allianceChannels, setAllianceChannels,
    selectedAllianceChannel, allianceMessages, loadAlliances,
    selectAllianceChannel, clearSelectedAllianceChannel, sendAllianceMessage,
  } = useAlliances(showHubError);
  const [pendingApprovalHubs, setPendingApprovalHubs] = useState<Set<string>>(new Set());
  // lobby-bot-survey.md Feature 1 — hubs whose session is confined to the
  // lobby (PoW below the hub's min_security_level). Detected reactively via
  // the 403 lobby_scope_confined body loadHubData() gets back from
  // /channels, which covers both the initial join and reconnect-after-close
  // (requirement: re-detect on reload) with one code path.
  const [lobbyHubs, setLobbyHubs] = useState<Set<string>>(new Set());

  // === View ===
  const [view, setView] = useState<View>("channels");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  // === Messages ===
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [newWhileScrolledUp, setNewWhileScrolledUp] = useState(0);
  const [memberSidebarHidden, setMemberSidebarHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [firstNotifyingMessageId, setFirstNotifyingMessageId] = useState<string | null>(null);

  // === DMs ===
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [dmMessages, setDmMessages] = useState<Record<string, DmMessage[]>>({});

  // === Unread / notifications ===
  const {
    unreadByChannel, unreadDms, setUnreadDms,
    bumpUnread, clearUnread, clearHubUnread: clearHubUnreadFn, seedUnreadFromServer,
  } = useUnreadCounts();
  const {
    hubNotifyMode, channelNotifyMode, pinnedChannels, collapsedCategories, hideSilenced,
    setHubNotifyMode, setChannelNotifyMode, setCollapsedCategories, toggleHideSilenced, effectiveNotifyMode,
  } = useNotificationPrefs();
  const silencedChannelIds = useMemo(() => {
    if (!activeHubId) return new Set<string>();
    return new Set(
      channels
        .filter((c) => !c.is_category && effectiveNotifyMode(activeHubId, c.id) === "silent")
        .map((c) => c.id),
    );
  }, [channels, activeHubId, effectiveNotifyMode]);
  const pubkeyToName = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const u of users) m[u.public_key] = u.display_name ?? null;
    return m;
  }, [users]);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [ignoredUsers, setIgnoredUsers] = useState<Set<string>>(() => {
    try {
      const raw = getScoped("wavvon.ignoredUsers");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });

  function toggleBlockUser(pubkey: string) {
    const prev = blockedUsers;
    const next = new Set(prev);
    if (next.has(pubkey)) next.delete(pubkey);
    else next.add(pubkey);
    setBlockedUsers(next);
    // Optimistic update; on failure revert and say so — a silently
    // unpersisted block is a safety problem, not a cosmetic one.
    updateDmBlocks(Array.from(next)).catch((e) => {
      setBlockedUsers(prev);
      showHubError(e instanceof HubApiError ? e.message : String(e));
    });
  }

  function toggleIgnoreUser(pubkey: string) {
    setIgnoredUsers((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      try { setScoped("wavvon.ignoredUsers", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }
  // === Hub admin ===
  const {
    showHubAdmin, setShowHubAdmin,
    hubAdminTab, setHubAdminTab,
    hubAdminName, setHubAdminName,
    hubAdminDescription, setHubAdminDescription,
    hubAdminIcon, setHubAdminIcon,
    hubAdminRequireApproval, setHubAdminRequireApproval,
    hubAdminMinLevel, setHubAdminMinLevel,
    hubAdminWelcomeLabel, setHubAdminWelcomeLabel,
    hubAdminWelcomeInviteUrl, setHubAdminWelcomeInviteUrl,
    hubAdminSaveError,
    hubAdminMembers,
    hubAdminBans,
    hubAdminInvites,
    hubAdminPending,
    maxChannelDepth, setMaxChannelDepth,
    openHubAdmin,
    saveHubAdminSettings,
    addInvite,
    removeInvite,
    setMemberRoles,
  } = useHubAdmin({
    activeHubId,
    // The sidebar renders the locally-stored hub list, whose hub_name is
    // written at add-time — sync it or a rename never shows up there.
    onSaved: (name) => {
      if (activeHubId && renameSavedHub(activeHubId, name)) {
        setHubs(listHubs());
      }
    },
  });

  // === Profile on the active hub (community-axis; the hub is the source of
  // truth, PATCH /me writes it). The per-account default profile is read from
  // scoped storage at use time — no App state to go stale.
  async function handleUpdateHubProfile(profile: DefaultProfile) {
    try {
      await hubFetch("/me", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: profile.display_name,
          avatar: profile.avatar ?? "",
          bio: profile.bio ?? "",
          pronouns: profile.pronouns ?? "",
          status_message: profile.status_message ?? "",
          activities: profile.activities ?? "",
          accent_color: profile.accent_color ?? "",
          cover: profile.cover ?? "",
          favorite_hubs: profile.favorite_hubs,
          show_hubs: profile.show_hubs,
        }),
      });
      hubFetch("/me").then((r) => r.json() as Promise<MeInfo>).then(setMeInfo).catch(() => {});
      hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  // The settings profile editor PATCHes any hub itself (via that hub's own
  // session); App only needs to refresh its active-hub mirrors afterwards.
  function handleHubProfileSaved(hubId: string) {
    if (hubId !== activeHubId) return;
    hubFetch("/me").then((r) => r.json() as Promise<MeInfo>).then(setMeInfo).catch(() => {});
    hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
  }

  // === Farm admin ===
  const {
    showFarmSettings, setShowFarmSettings,
    farmAdminTab, setFarmAdminTab,
    farmAdminUrl,
    isFarmAdmin,
    showCreateHub, setShowCreateHub,
    knownFarms,
  } = useFarmAdmin({ publicKey, hubs });
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // === New web-only UI state ===
  const [showDiscover, setShowDiscover] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [showDisplayNamePrompt, setShowDisplayNamePrompt] = useState(false);
  const [firstRunName, setFirstRunName] = useState("");
  const [userContextMenu, setUserContextMenu] = useState<{
    pubkey: string;
    displayName: string | null;
    position: { x: number; y: number };
  } | null>(null);

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

  // === Typing ===
  const selectedChannelIdRef = useRef<string | undefined>(undefined);
  const selectedConvIdRef = useRef<string | undefined>(undefined);
  const publicKeyRef = useRef<string | null>(publicKey);
  publicKeyRef.current = publicKey;
  const mentionPingEnabledRef = useRef(mentionPingEnabled);
  mentionPingEnabledRef.current = mentionPingEnabled;
  // Mirrored for the WS handlers: "dnd" presence and "silent" notify
  // modes both gate notifications.
  const myPresenceRef = useRef(myPresence);
  myPresenceRef.current = myPresence;
  const effectiveNotifyModeRef = useRef(effectiveNotifyMode);
  effectiveNotifyModeRef.current = effectiveNotifyMode;
  const { typingByKey, dmTypingByKey, receiveTyping, pingTyping, pingDmTyping } = useTypingIndicators(
    () => selectedChannelIdRef.current,
    () => selectedConvIdRef.current,
    () => publicKeyRef.current,
  );
  const { chipsByChannel: soundboardChipsByChannel, receiveSoundboardPlayed } = useSoundboardChips();
  const [soundboardPlayingClipId, setSoundboardPlayingClipId] = useState<string | null>(null);

  // === Refs ===
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesEndChannelRef = useRef<HTMLLIElement | null>(null);
  const messagesContainerRef = useRef<HTMLOListElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const screenShareViewerRef = useRef<ScreenShareViewerRef | null>(null);
  const [activeScreenShares, setActiveScreenShares] = useState<ActiveStream[]>([]);
  const screenShareSessionRef = useRef<WebScreenShareSession | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareKbps, setShareKbps] = useState(0);
  const [shareLocalStream, setShareLocalStream] = useState<MediaStream | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  // Camera video (full-mesh WebRTC over the main WS).
  const videoSessionRef = useRef<WebVideoSession | null>(null);
  const backgroundProcessorRef = useRef<BackgroundProcessor | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const videoEnabledRef = useRef(videoEnabled);
  videoEnabledRef.current = videoEnabled;
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Map<string, MediaStream>>(new Map());
  // Whisper: set of pubkeys currently whispering to me + whether I'm whispering.
  const [whisperingFrom, setWhisperingFrom] = useState<Set<string>>(new Set());
  const [whisperingTo, setWhisperingTo] = useState<string[]>([]);
  const [pttConfig, setPttConfig] = useState(loadPttConfig);
  const [surveyToShow, setSurveyToShow] = useState<import("@platform").SurveyAdmin | null>(null);
  const surveyDismissedRef = useRef<Set<string>>(new Set());
  // Hub-streams: cross-channel screen-share discovery + subscriptions.
  const [hubStreams, setHubStreams] = useState<import("./types").HubStreamInfo[]>([]);
  const [showHubStreams, setShowHubStreams] = useState(false);
  const subscribedStreamIds = useRef<Set<string>>(new Set());
  // Registered so switchAccount can refuse a mid-voice switch at the source
  // (defense in depth alongside the disabled Switch button in Settings →
  // Account) — switching accounts while joined to a voice channel is blocked
  // outright, not auto-left on the caller's behalf.
  useEffect(() => {
    setSwitchGuard(() => (voiceChannelId ? t("settings.account.accounts.switch_blocked_voice") : null));
    return () => setSwitchGuard(null);
  }, [voiceChannelId, t]);

  // Per-instance resources this App holds that any unmount (a key-remounted
  // account switch, or otherwise) must tear down explicitly. Module-level
  // singletons like the hub WebSocket sessions are reset separately, by
  // AccountRoot's switch handler (platform/session.ts resetHubSessions) —
  // that reset runs regardless of whether this cleanup does.
  useEffect(() => {
    return () => {
      voiceSessionRef.current?.stop();
      videoSessionRef.current?.dispose();
      screenShareSessionRef.current?.stop();
      backgroundProcessorRef.current?.stop();
    };
  }, []);
  // Reload PTT config when the settings screen changes it.
  useEffect(() => {
    const reload = () => setPttConfig(loadPttConfig());
    window.addEventListener("wavvon:ptt", reload);
    return () => window.removeEventListener("wavvon:ptt", reload);
  }, []);
  // Push-to-talk: only active when enabled AND in voice. Start muted; the
  // bound key unmutes while held. When disabled, this effect does nothing,
  // so non-PTT users are entirely unaffected.
  useEffect(() => {
    if (!pttConfig.enabled || !voiceChannelId) return;
    setSelfMuted(true);
    voiceSessionRef.current?.setMuted(true);
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== pttConfig.key || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      setSelfMuted(false);
      voiceSessionRef.current?.setMuted(false);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== pttConfig.key) return;
      setSelfMuted(true);
      voiceSessionRef.current?.setMuted(true);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [pttConfig.enabled, pttConfig.key, voiceChannelId]);

  // Sound cue when someone else joins/leaves the voice channel you're in.
  // Counts OTHERS only, so it never double-fires with the self join/leave tone.
  const prevVoiceOthersRef = useRef(0);
  useEffect(() => {
    if (!voiceChannelId) { prevVoiceOthersRef.current = 0; return; }
    const others = (voicePartByChannel[voiceChannelId] ?? []).filter((p) => p.public_key !== publicKey).length;
    const prev = prevVoiceOthersRef.current;
    if (voiceSoundsOn() && others !== prev) {
      try { playVoiceTone(others > prev ? "up" : "down"); } catch { /* audio not ready */ }
    }
    prevVoiceOthersRef.current = others;
  }, [voicePartByChannel, voiceChannelId, publicKey]);

  const [activeBotApps, setActiveBotApps] = useState<Map<string, BotAppLaunchEvent>>(new Map());
  const [activeOpenApp, setActiveOpenApp] = useState<{ event: BotAppOpenEvent; hubUrl: string } | null>(null);

  const loadingHub = useRef(false);


  // === Identity init ===

  useEffect(() => {
    loadIdentity().then((rec) => {
      if (rec) {
        setPublicKey(rec.canonical_pubkey ?? publicKeyHex(rec.seed_hex));
        setReady("ok");
      } else {
        setReady("setup");
      }
    });
  }, []);

  function handleIdentityComplete(result: IdentitySetupCompletion) {
    // Nickname + avatar chosen during onboarding become the default profile,
    // which the first-hub effect below applies automatically via PATCH /me.
    if (result.profile) saveDefaultProfile({ display_name: result.profile.display_name, avatar: result.profile.avatar, bio: null, pronouns: null, status_message: null, activities: null, accent_color: null, cover: null, favorite_hubs: [], show_hubs: false });
    loadIdentity().then((rec) => {
      if (rec) setPublicKey(rec.canonical_pubkey ?? publicKeyHex(rec.seed_hex));
      setReady("ok");
    });
  }

  // Document title (unread count)
  const unreadByHub = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [hub, m] of Object.entries(unreadByChannel)) {
      out[hub] = Object.keys(m).length;
    }
    return out;
  }, [unreadByChannel]);

  useEffect(() => {
    const total = Object.values(unreadByHub).reduce((n, v) => n + v, 0);
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) Wavvon` : "Wavvon";
  }, [unreadByHub]);

  // === WS handlers (stable via ref) ===

  const activeHubIdRef = useRef<string | null>(null);
  useEffect(() => { activeHubIdRef.current = activeHubId; }, [activeHubId]);

  const hubsRef = useRef<Hub[]>([]);
  const channelsRef = useRef<Channel[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  const pendingDeepLinkTargetRef = useRef<NonNullable<HubInputResult["target"]> | null>(null);
  const [pendingScrollMessageId, setPendingScrollMessageId] = useState<string | null>(null);
  useEffect(() => { hubsRef.current = hubs; }, [hubs]);

  const meInfoRef = useRef<MeInfo | null>(null);
  useEffect(() => { meInfoRef.current = meInfo; }, [meInfo]);

  // handleVoiceJoin's "already there" guard is called both from JSX (fresh
  // voiceChannelId) and from the frozen onVoiceMove WS handler below — the
  // ref keeps that guard correct from either call site.
  const voiceChannelIdRef = useRef<string | null>(null);
  useEffect(() => { voiceChannelIdRef.current = voiceChannelId; }, [voiceChannelId]);

  useEffect(() => {
    if (hubs.length === 1 && meInfo !== null && !meInfo.display_name) {
      // A default profile means the user already told us who they want to
      // be — apply it silently instead of asking again. Read at fire time so
      // edits made in Settings since mount are honored.
      const def = loadDefaultProfile();
      if (def) {
        void handleUpdateHubProfile(def);
      } else {
        setShowDisplayNamePrompt(true);
      }
    }
  // Only fire once when meInfo first loads on the first hub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meInfo?.display_name, hubs.length]);

  const selectedChannelRef = useRef<Channel | null>(null);
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
    selectedChannelIdRef.current = selectedChannel?.id;
  }, [selectedChannel]);

  const selectedConvRef = useRef<Conversation | null>(null);
  useEffect(() => {
    selectedConvRef.current = selectedConversation;
    selectedConvIdRef.current = selectedConversation?.id;
  }, [selectedConversation]);

  // Toast state for hub error messages (W6)
  const [hubErrorToast, setHubErrorToast] = useState<string | null>(null);
  const hubErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showHubError(msg: string) {
    if (hubErrorTimerRef.current) clearTimeout(hubErrorTimerRef.current);
    setHubErrorToast(msg);
    hubErrorTimerRef.current = setTimeout(() => setHubErrorToast(null), 5000);
  }

  // Scrolls to and flashes an already-loaded message row (reply-jump,
  // pinned-message jump, and the tail end of message-permalink navigation
  // once the target channel's history has loaded — nested-channels-ux.md §1.3).
  function handleScrollToMessage(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  }

  // A channel-permalink message target may point at a channel that wasn't
  // yet selected, so the message row doesn't exist until its history loads.
  useEffect(() => {
    if (!pendingScrollMessageId) return;
    if (!messages.some((m) => m.id === pendingScrollMessageId)) return;
    const id = pendingScrollMessageId;
    setPendingScrollMessageId(null);
    requestAnimationFrame(() => handleScrollToMessage(id));
  }, [messages, pendingScrollMessageId]);

  // Give up on a pending message-permalink scroll if the target isn't in
  // the loaded history window (e.g. it's older than what's fetched).
  useEffect(() => {
    if (!pendingScrollMessageId) return;
    const timer = setTimeout(() => setPendingScrollMessageId(null), 8000);
    return () => clearTimeout(timer);
  }, [pendingScrollMessageId]);

  const stableHandlersRef = useRef<WsHandlers>({});

  const stableHandlers: WsHandlers = useMemo(() => ({
    onMessage: (raw) => {
      const m = raw as Record<string, unknown>;
      const type = m.type as string;
      const msgHubId = m._hub_id as string | undefined;
      const activeHub = activeHubIdRef.current;
      if (type === "message") {
        const msg = m.message as Message | undefined;
        if (!msg) return;
        const selCh = selectedChannelRef.current;
        const isActiveHub = msgHubId === activeHub;
        const isActiveChannel = isActiveHub && m.channel_id === selCh?.id;
        if (isActiveChannel) {
          setMessages((prev) => prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]);
          setStickToBottom((stick) => { if (stick) setNewWhileScrolledUp(0); else setNewWhileScrolledUp((n) => n + 1); return stick; });
        } else if (msgHubId && m.channel_id) {
          bumpUnread(msgHubId, m.channel_id as string);
        }
        const myName = meInfoRef.current?.display_name ?? null;
        const myPk = publicKeyRef.current;
        const isMention = (myName && mentionsName(msg.content, myName)) ||
          (myPk && msg.content.includes(myPk));
        // Read-time notification gate, two independent quiets: "dnd"
        // presence (global) and a "silent" notify mode on this hub or
        // channel (hub mute). Either way unreads still accumulate.
        const silenced = myPresenceRef.current.status === "dnd" ||
          (!!msgHubId && typeof m.channel_id === "string" &&
            effectiveNotifyModeRef.current(msgHubId, m.channel_id) === "silent");
        if (isMention && msg.sender !== myPk && !silenced) {
          if (mentionPingEnabledRef.current) {
            try { playMentionPing(); } catch { /* audio context may not be ready */ }
          }
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`${msg.sender_name ?? "Someone"} mentioned you`, {
              body: msg.content.slice(0, 100),
              tag: msg.id,
            });
          }
        }
      } else if (type === "message_edited") {
        if (msgHubId !== activeHub) return;
        if (m.channel_id !== selectedChannelRef.current?.id) return;
        const msg = m.message as Message | undefined;
        if (msg) setMessages((prev) => prev.map((x) => x.id === msg.id ? msg : x));
      } else if (type === "message_deleted") {
        if (msgHubId !== activeHub) return;
        if (m.channel_id !== selectedChannelRef.current?.id) return;
        const id = m.message_id as string;
        if (id) setMessages((prev) => prev.filter((x) => x.id !== id));
      } else if (type === "reactions_updated") {
        if (msgHubId !== activeHub) return;
        if (m.channel_id !== selectedChannelRef.current?.id) return;
        const msgId = m.message_id as string | undefined;
        const reactions = m.reactions as Message["reactions"] | undefined;
        if (msgId && reactions) {
          setMessages((prev) => prev.map((x) => {
            if (x.id !== msgId) return x;
            const myEmojis = new Set(
              (x.reactions ?? []).filter((r) => r.me).map((r) => r.emoji)
            );
            return {
              ...x,
              reactions: reactions.map((r) => ({ ...r, me: myEmojis.has(r.emoji) })),
            };
          }));
        }
      }
    },
    onDm: (raw) => {
      const m = raw as Record<string, unknown>;
      const convId = m.conversation_id as string | undefined;
      if (!convId) return;
      setUnreadDms((prev) => ({ ...prev, [convId]: true }));
      // WS gives plaintext (or "[encrypted]" placeholder for encrypted).
      // Reload conversation messages so the browser client can auto-decrypt.
      if (convId === selectedConvRef.current?.id) {
        getDmMessages(convId).then((msgs) => {
          const asDm: DmMessage[] = msgs.map((mm) => ({
            id: mm.id,
            sender: mm.sender,
            sender_name: mm.sender_name,
            content: mm.content,
            timestamp: mm.created_at,
            attachments: mm.attachments,
            is_encrypted: mm.is_encrypted,
            delivery_failed: mm.delivery_failed,
          }));
          setDmMessages((prev) => ({ ...prev, [convId]: asDm }));
        }).catch(() => {});
      }
    },
    onVideo: (raw) => {
      const m = raw as { _hub_id?: string };
      if (m._hub_id !== activeHubIdRef.current) return;
      void videoSessionRef.current?.handle(m as Record<string, unknown>);
    },
    onWhisper: (raw) => {
      const m = raw as { type?: string; sender_pubkey?: string; _hub_id?: string };
      if (m._hub_id !== activeHubIdRef.current || !m.sender_pubkey) return;
      const sender = m.sender_pubkey;
      setWhisperingFrom((prev) => {
        const next = new Set(prev);
        if (m.type === "voice_whisper_started") next.add(sender);
        else next.delete(sender);
        return next;
      });
    },
    onVoiceMove: (raw) => {
      const m = raw as { _hub_id?: string } & Parameters<typeof decideVoiceMove>[0];
      if (m._hub_id !== activeHubIdRef.current) return;
      const decision = decideVoiceMove(m);
      if (decision.kind === "ignore") return;
      if (decision.kind === "auto") {
        setVoiceChannelNameHint(decision.targetChannelName);
        void handleVoiceJoin(decision.targetChannelId);
        showVoiceMoveToast(decision.targetChannelName, decision.sourceChannelId);
      } else {
        setVoiceMovePrompt({ targetChannelId: decision.targetChannelId, targetChannelName: decision.targetChannelName });
      }
    },
    onVoiceState: (raw) => {
      const m = raw as { type?: string; channel_id?: string; participants?: VoiceParticipant[]; participant?: VoiceParticipant; public_key?: string; speaking?: boolean; _hub_id?: string; sender_id?: number };
      if (m._hub_id !== activeHubIdRef.current) return;
      if (!m.channel_id) return;
      const channelId = m.channel_id;

      if (m.type === "voice_roster_update" && m.participants) {
        const rosterParticipants = m.participants as unknown as Array<{ sender_id: number; public_key: string }>;
        voiceSessionRef.current?.handleRosterUpdate(rosterParticipants);
      }

      if (m.type === "voice_participant_left") {
        if (!m.public_key) return;
        const leftKey = m.public_key;
        setVoicePartByChannel((prev) => {
          const existing = prev[channelId];
          if (!existing) return prev;
          const next = existing.filter((p) => p.public_key !== leftKey);
          if (next.length === 0) {
            const { [channelId]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [channelId]: next };
        });
        setVoiceActiveUsers((prev) => {
          if (!prev.has(leftKey)) return prev;
          const next = new Set(prev);
          next.delete(leftKey);
          return next;
        });
      } else if (m.type === "voice_participant_joined") {
        if (!m.participant) return;
        const joined = m.participant;
        setVoicePartByChannel((prev) => {
          const existing = prev[channelId] ?? [];
          if (existing.some((p) => p.public_key === joined.public_key)) return prev;
          return { ...prev, [channelId]: [...existing, joined] };
        });
      } else if (m.type === "voice_participant_speaking") {
        if (!m.public_key) return;
        const speakerKey = m.public_key;
        const isSpeaking = m.speaking ?? true;
        setVoiceActiveUsers((prev) => {
          const hasSpeaker = prev.has(speakerKey);
          if (isSpeaking === hasSpeaker) return prev;
          const next = new Set(prev);
          if (isSpeaking) next.add(speakerKey); else next.delete(speakerKey);
          return next;
        });
      } else if (m.participants) {
        setVoicePartByChannel((prev) => ({ ...prev, [channelId]: m.participants! }));
      }
    },
    onTyping: (raw) => {
      receiveTyping(raw as Record<string, unknown>);
    },
    onScreenShare: (raw) => {
      const m = raw as Record<string, unknown>;
      if (m._hub_id !== activeHubIdRef.current) return;
      if (m.type === "screen_share_started") {
        const ev = m as unknown as ActiveStream & { channel_id: string; _hub_id: string };
        setActiveScreenShares((prev) => {
          if (prev.some((s) => s.stream_id === ev.stream_id)) return prev;
          return [...prev, { stream_id: ev.stream_id, sharer_pubkey: ev.sharer_pubkey, kind: ev.kind, mime: ev.mime, has_audio: ev.has_audio }];
        });
        // Keep the cross-channel discovery list live.
        setHubStreams((prev) => prev.some((s) => s.stream_id === ev.stream_id) ? prev : [...prev, {
          channel_id: ev.channel_id, stream_id: ev.stream_id, sharer_pubkey: ev.sharer_pubkey, kind: ev.kind, mime: ev.mime, has_audio: ev.has_audio,
        }]);
      } else if (m.type === "screen_share_stopped") {
        const streamId = m.stream_id as string;
        setActiveScreenShares((prev) => prev.filter((s) => s.stream_id !== streamId));
        setHubStreams((prev) => prev.filter((s) => s.stream_id !== streamId));
        screenShareViewerRef.current?.stopStream(streamId);
      } else if (m.type === "hub_streams") {
        setHubStreams((m.streams as HubStreamInfo[]) ?? []);
      } else if (m.type === "stream_subscribed") {
        // A cross-channel stream we asked to watch — register it so the
        // viewer builds a MediaSource for its incoming chunks.
        const streamId = m.stream_id as string;
        subscribedStreamIds.current.add(streamId);
        setActiveScreenShares((prev) => prev.some((s) => s.stream_id === streamId) ? prev : [...prev, {
          stream_id: streamId,
          sharer_pubkey: m.sharer_pubkey as string,
          kind: (m.kind as "screen" | "webcam") ?? "screen",
          mime: m.mime as string,
          has_audio: !!m.has_audio,
        }]);
      } else if (m.type === "stream_subscription_ended") {
        const streamId = m.stream_id as string;
        subscribedStreamIds.current.delete(streamId);
        setActiveScreenShares((prev) => prev.filter((s) => s.stream_id !== streamId));
        screenShareViewerRef.current?.stopStream(streamId);
      }
    },
    onScreenShareChunk: (streamId, isInit, data) => {
      screenShareViewerRef.current?.appendChunk(streamId, isInit, data);
    },
    onStatusChange: (connected, hubId) => {
      const hubName = hubsRef.current.find((h) => h.hub_id === hubId)?.hub_name ?? "hub";
      handleStatusChange(hubId, hubName, connected, setAssertiveAnnouncement);
      if (connected) {
        // Presence is global: push this device's status to the hub that
        // just (re)connected, but only if the user ever picked one here —
        // a fresh device must not stomp a status set elsewhere.
        const p = myPresenceRef.current;
        if (p.status !== "online") {
          try { sendSetStatusTo(hubId, p.status, null); } catch { /* ws not ready */ }
        }
      }
      if (connected && hubId === activeHubIdRef.current) {
        hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
        try { activeSession().ws?.requestStreamList(); } catch {}
      }
    },
    onError: (raw) => {
      const m = raw as Record<string, unknown>;
      if (m._hub_id !== activeHubIdRef.current) return;
      const message = (m.message as string | undefined) ?? "An error occurred on the hub.";
      showHubError(message);
    },
    onDmMemberChanged: (raw) => {
      const m = raw as { conversation_id?: string; added?: string[]; removed?: string[] };
      if (!m.conversation_id) return;
      const convId = m.conversation_id;
      hubFetch(`/conversations/${convId}`).then((r) => r.json() as Promise<import("@shared/types").Conversation>).then((updated) => {
        setConversations((prev) => prev.map((c) => c.id === convId ? updated : c));
      }).catch(() => {});
    },
    onPin: (raw) => {
      const m = raw as Record<string, unknown>;
      if (m._hub_id !== activeHubIdRef.current) return;
    },
    onPoll: (raw) => {
      const m = raw as Record<string, unknown>;
      if (m._hub_id !== activeHubIdRef.current) return;
    },
    onSoundboardPlayed: (raw) => {
      const m = raw as Record<string, unknown>;
      if (m._hub_id !== activeHubIdRef.current) return;
      receiveSoundboardPlayed(raw);
    },
    onReauthNeeded: (hubId) => {
      reauthorizeHub(hubId, stableHandlersRef.current).then(() => {
        if (hubId === activeHubIdRef.current) void loadHubData();
      }).catch(() => {});
    },
    onChannelsUpdated: (hubId) => {
      if (hubId !== activeHubIdRef.current) return;
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then((list) => {
        setChannels(list);
      }).catch(() => {});
    },
    onMemberOnline: (publicKey, hubId) => {
      if (hubId !== activeHubIdRef.current) return;
      setUsers((prev) => {
        const known = prev.some((u) => u.public_key === publicKey);
        // A member we've never seen (joined after our initial /users load)
        // isn't in the list yet — refetch so they appear live (and resolve
        // to their name in the member list, message authors, video tiles).
        if (!known) {
          hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
          return prev;
        }
        return prev.map((u) => u.public_key === publicKey ? { ...u, online: true } : u);
      });
    },
    onMemberOffline: (publicKey, hubId) => {
      if (hubId !== activeHubIdRef.current) return;
      setUsers((prev) => prev.map((u) => u.public_key === publicKey ? { ...u, online: false } : u));
    },
    onMemberUpdated: (publicKey, displayName, avatar, hubId) => {
      if (hubId !== activeHubIdRef.current) return;
      // Update the member's name/avatar in place so the member list and every
      // message author (names resolve from this map) refresh live. If we've
      // never seen them, refetch so they appear.
      setUsers((prev) => {
        if (!prev.some((u) => u.public_key === publicKey)) {
          hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
          return prev;
        }
        return prev.map((u) =>
          u.public_key === publicKey ? { ...u, display_name: displayName, avatar } : u,
        );
      });
    },
    onMemberStatus: (publicKey, status, custom, hubId) => {
      if (hubId !== activeHubIdRef.current) return;
      setUsers((prev) =>
        prev.map((u) =>
          u.public_key === publicKey ? { ...u, status, status_custom: custom } : u,
        ),
      );
    },
    onVoiceZoneState: (raw) => {
      const m = raw as { channel_id?: string; zones?: import("./platform/voice").VoiceZone[]; _hub_id?: string };
      if (m._hub_id !== activeHubIdRef.current) return;
      if (!m.channel_id || !m.zones) return;
      voiceSessionRef.current?.handleZoneState(m.channel_id, m.zones);
    },
    onVoiceZoneCreated: (raw) => {
      const m = raw as { zone_id?: string; name?: string; coordinate_system?: string; attenuation?: import("./platform/voice").VoiceZoneAttenuation; _hub_id?: string };
      if (m._hub_id !== activeHubIdRef.current) return;
      if (!m.zone_id || !m.name || !m.coordinate_system || !m.attenuation) return;
      voiceSessionRef.current?.handleZoneCreated({
        zone_id: m.zone_id,
        name: m.name,
        coordinate_system: m.coordinate_system,
        attenuation: m.attenuation,
      });
    },
    onVoiceZoneDestroyed: (raw) => {
      const m = raw as { zone_id?: string; _hub_id?: string };
      if (m._hub_id !== activeHubIdRef.current) return;
      if (!m.zone_id) return;
      voiceSessionRef.current?.handleZoneDestroyed(m.zone_id);
    },
    onVoicePositionUpdated: (raw) => {
      const m = raw as { zone_id?: string; public_key?: string; position?: number[]; _hub_id?: string };
      if (m._hub_id !== activeHubIdRef.current) return;
      if (!m.zone_id || !m.public_key || !m.position) return;
      voiceSessionRef.current?.handlePositionUpdated(m.zone_id, m.public_key, m.position);
    },
    onBotApp: (raw) => {
      const m = raw as Record<string, unknown>;
      if (m._hub_id !== activeHubIdRef.current) return;
      const type = m.type as string;
      if (type === "bot_app_launch") {
        const ev = m as unknown as BotAppLaunchEvent;
        setActiveBotApps((prev) => {
          const next = new Map(prev);
          next.set(ev.bot_id, ev);
          return next;
        });
      } else if (type === "bot_app_open") {
        const ev = m as unknown as BotAppOpenEvent;
        const hubUrl = hubsRef.current.find((h) => h.hub_id === activeHubIdRef.current)?.hub_url ?? "";
        setActiveOpenApp({ event: ev, hubUrl });
      } else if (type === "bot_app_close") {
        const botId = m.bot_id as string;
        setActiveBotApps((prev) => {
          const next = new Map(prev);
          next.delete(botId);
          return next;
        });
        setActiveOpenApp((prev) => prev?.event.bot_id === botId ? null : prev);
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  stableHandlersRef.current = stableHandlers;

  function sendBotAppJoin(botId: string, channelId: string) {
    try {
      activeSession().ws?.send({ type: "bot_app_join", bot_id: botId, channel_id: channelId });
    } catch {}
  }

  // === Hub restore on startup ===

  useEffect(() => {
    if (ready !== "ok") return;
    async function restore() {
      const list = await restorePersistedHubs(stableHandlers);
      setHubs(list);
      const id = getActiveHubId();
      if (id) {
        setActiveHubIdState(id);
        await loadHubData();
        publishDhKey().catch(() => {});
      }
      const globalHomeHub = window.__WAVVON_HOME_HUB__;
      if (typeof globalHomeHub === "string" && globalHomeHub.trim() && loadSavedHubs().length === 0) {
        setHomeHubUrl(globalHomeHub.trim());
      }
    }
    void restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function clearHubUnread(hubId: string) { clearHubUnreadFn(hubId); }

  // === Hub data loading ===

  async function loadHubData() {
    if (loadingHub.current) return;
    loadingHub.current = true;
    // Self-heal the locally-cached hub name (stored at add-time): a rename
    // done in hub admin — possibly on another device — otherwise never
    // reaches the sidebar, not even across reloads. Fire-and-forget.
    hubFetch("/info")
      .then((r) => r.json() as Promise<{ name?: string }>)
      .then((info) => {
        const hubId = getActiveHubId();
        if (hubId && info?.name && renameSavedHub(hubId, info.name)) {
          setHubs(listHubs());
        }
      })
      .catch(() => { /* cosmetic sync only */ });
    try {
      const [ch, usr, me, convs, cmds, voiceRoster, dmBlocks] = await Promise.allSettled([
        hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>),
        hubFetch("/users").then((r) => r.json() as Promise<User[]>),
        hubFetch("/me").then((r) => r.json() as Promise<MeInfo>),
        hubFetch("/conversations").then((r) => r.json() as Promise<Conversation[]>),
        listBotCommands().catch(() => [] as Array<{ command: string; description: string; bot_name: string }>),
        fetchVoiceRoster().catch(() => ({} as Record<string, VoiceParticipant[]>)),
        getDmBlocks().catch(() => null),
      ]);
      // A lobby-scoped session (lobby-bot-survey.md Feature 1) 403s every
      // route outside the lobby allowlist — /channels is always in that
      // batch, so its rejection reason is the signal. Checked before
      // touching any other settled promise; the others 403 the same way and
      // there's nothing useful to salvage from them for a lobby hub.
      const hubIdForLobbyCheck = getActiveHubId();
      if (ch.status === "rejected" && isLobbyScopeConfined(ch.reason)) {
        if (hubIdForLobbyCheck) {
          setLobbyHubs((prev) => new Set([...prev, hubIdForLobbyCheck]));
        }
        // Drop whatever channel/user/conversation data is left over from a
        // previously active member hub — the lobby screen replaces the main
        // content area, but the persistent hub sidebar renders straight off
        // this state and would otherwise show a stale, unrelated hub's data.
        setChannels([]);
        setUsers([]);
        setConversations([]);
        setSelectedChannel(null);
        return;
      }
      if (hubIdForLobbyCheck) {
        setLobbyHubs((prev) => {
          if (!prev.has(hubIdForLobbyCheck)) return prev;
          const next = new Set(prev);
          next.delete(hubIdForLobbyCheck);
          return next;
        });
      }
      void loadAlliances();
      if (ch.status === "fulfilled") {
        setChannels(ch.value);
        if (!selectedChannelRef.current) {
          const first = ch.value.find((c) => !c.is_category && c.channel_type !== "banner" && c.channel_type !== "spawner");
          if (first) {
            setSelectedChannel(first);
            // Load the auto-selected channel's history + subscribe. Without
            // this the message pane stays empty after a hub switch (only
            // handleSelectChannel fetched messages, and switching bypasses it).
            subscribeChannel(first.id).catch(() => {});
            getMessages(first.id)
              .then((msgs) => {
                // Guard against a racing manual selection while we awaited.
                if (selectedChannelRef.current?.id === first.id) {
                  setMessages(msgs);
                  setStickToBottom(true);
                }
              })
              .catch(() => {});
          }
        }
      }
      if (usr.status === "fulfilled") setUsers(usr.value);
      if (me.status === "fulfilled") {
        const meVal = me.value;
        setMeInfo(meVal);
        const hubId = getActiveHubId();
        if (meVal.approval_status === "pending" && hubId) {
          setPendingApprovalHubs((prev) => new Set([...prev, hubId]));
          return;
        }
        if (hubId) {
          setPendingApprovalHubs((prev) => {
            if (!prev.has(hubId)) return prev;
            const next = new Set(prev);
            next.delete(hubId);
            return next;
          });
        }
      }
      if (convs.status === "fulfilled") setConversations(convs.value);
      if (cmds.status === "fulfilled") setSlashCommands(cmds.value);
      if (voiceRoster.status === "fulfilled") setVoicePartByChannel(voiceRoster.value);
      // The hub is the source of truth for DM blocks; without this seed the
      // list silently reset to empty on every reload.
      if (dmBlocks.status === "fulfilled" && dmBlocks.value) setBlockedUsers(new Set(dmBlocks.value));
      const hubId = getActiveHubId();
      if (hubId) {
        getUnreadCounts().then((counts) => seedUnreadFromServer(hubId, counts)).catch(() => {});
      }
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      // Show the onboarding survey if this hub has an active one we haven't
      // handled this session.
      // GET /survey/current only returns a survey when one is enabled (no
      // `enabled` field on the public shape), so its presence is the signal.
      getCurrentSurvey().then((s) => {
        if (s && s.questions.length > 0 && !surveyDismissedRef.current.has(s.id)) {
          setSurveyToShow(s);
        }
      }).catch(() => {});
    } finally {
      loadingHub.current = false;
    }
  }

  // Lobby -> member transition in place (lobby-bot-survey.md Feature 1):
  // /lobby/submit-pow already flipped the session's scope server-side on the
  // same token, so there's no re-auth here — just open the WS the hub had
  // been rejecting, drop the lobby screen, and pull the now-unlocked hub
  // data.
  async function handleLobbyPromoted(hubId: string) {
    setLobbyHubs((prev) => {
      if (!prev.has(hubId)) return prev;
      const next = new Set(prev);
      next.delete(hubId);
      return next;
    });
    connectHubWebSocket(hubId, stableHandlersRef.current);
    if (hubId === activeHubIdRef.current) {
      await loadHubData();
      publishDhKey().catch(() => {});
    }
    const hubName = hubsRef.current.find((h) => h.hub_id === hubId)?.hub_name ?? "the hub";
    showHubError(t("lobby.welcome", { hub: hubName }));
  }

  // === Hub management ===

  async function handleSwitchHub(hubId: string) {
    setActiveHub(hubId);
    setActiveHubIdState(hubId);
    setSelectedChannel(null);
    setSelectedConversation(null);
    clearSelectedAllianceChannel();
    setUserAlliances([]);
    setAllianceChannels({});
    setMessages([]);
    setView("channels");
    await loadHubData();
  }

  // Matches a wavvon:// deep-link host against an already-joined hub
  // (nested-channels-ux.md §1.5).
  function findHubByUrl(url: string): Hub | undefined {
    let host: string;
    try { host = new URL(url).host.toLowerCase(); } catch { return undefined; }
    return hubsRef.current.find((h) => {
      try { return new URL(h.hub_url).host.toLowerCase() === host; } catch { return false; }
    });
  }

  // Applies a parsed channel/message permalink target once its hub is the
  // active one: selects the channel and, for a message target, queues the
  // scroll-to-message once that channel's history has loaded.
  async function applyDeepLinkTarget(hubId: string, target: NonNullable<HubInputResult["target"]>) {
    if (getActiveHubId() !== hubId) {
      await handleSwitchHub(hubId);
    }
    let list = channelsRef.current;
    try {
      list = await hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>);
    } catch { /* fall back to whatever is already loaded */ }
    const ch = list.find((c) => c.id === target.channelId);
    if (!ch) {
      showHubError(t("hub.permalink.channel_not_found"));
      return;
    }
    await handleSelectChannel(ch);
    if (target.kind === "message") setPendingScrollMessageId(target.messageId);
  }

  async function handleRemoveHub(hubId: string) {
    await removeHub(hubId);
    const list = listHubs();
    setHubs(list);
    if (activeHubId === hubId) {
      const next = list[0]?.hub_id ?? null;
      setActiveHubIdState(next);
      setSelectedChannel(null);
      setSelectedConversation(null);
      clearSelectedAllianceChannel();
      setUserAlliances([]);
      setAllianceChannels({});
      if (next) await loadHubData();
    }
  }

  function handleHubReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setHubs((prev) => {
      const next = arrayMove(
        prev,
        prev.findIndex((h) => h.hub_id === active.id),
        prev.findIndex((h) => h.hub_id === over.id),
      );
      reorderHubs(next.map((h) => h.hub_id)).catch(() => {});
      return next;
    });
  }

  // Shared by AddHubModal's "join" field and the create-hub self-host
  // panel's "paste your owner invite" field — both resolve through the
  // same parseHubInput + handleAddHub path, so a redeemed owner invite
  // (grant_role_id carrying ownership) lands the user in-hub already
  // owning it, same as any other invite redemption.
  function handleHubUrlInput(v: string) {
    const p = parseHubInput(v);
    setHubUrl(p?.hubUrl ?? v);
    if (p?.inviteCode) setInviteCode(p.inviteCode);
    setHubPreview({ state: "idle" });
    setAddHubError(null);
    if (p?.target) {
      const existing = findHubByUrl(p.hubUrl);
      if (existing) {
        pendingDeepLinkTargetRef.current = null;
        setShowAddHub(false);
        void applyDeepLinkTarget(existing.hub_id, p.target);
        return;
      }
      pendingDeepLinkTargetRef.current = p.target;
    } else {
      pendingDeepLinkTargetRef.current = null;
    }
  }

  async function handlePreviewHub() {
    setHubPreview({ state: "loading" });
    setAddHubError(null);
    try {
      const info = await previewHubInfo(hubUrl);
      setHubPreview({ state: "ok", url: hubUrl, name: info.name, icon: info.icon, welcome_label: info.welcome_label, welcome_invite_url: info.welcome_invite_url });
    } catch (e) {
      setHubPreview({ state: "error", message: String(e) });
    }
  }

  // Also the join path a redeemed owner invite takes from the "Create a
  // hub" self-host handoff (docs/docs/hub-creation-wizard.md §4) — no
  // separate join mechanism for that flow.
  async function handleAddHub() {
    setAddingHub(true);
    setAddHubError(null);
    try {
      const hub = await addHub(hubUrl, stableHandlers, { invite_code: inviteCode || undefined });
      setHubs(listHubs());
      setActiveHubIdState(hub.hub_id);
      setShowAddHub(false);
      setShowCreateHub(false);
      setHubUrl("");
      setInviteCode("");
      setHubPreview({ state: "idle" });
      await loadHubData();
      publishDhKey().catch(() => {});
      const target = pendingDeepLinkTargetRef.current;
      if (target) {
        pendingDeepLinkTargetRef.current = null;
        await applyDeepLinkTarget(hub.hub_id, target);
      }
    } catch (e) {
      setAddHubError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setAddingHub(false);
    }
  }

  async function handleAddHubWithPasskey() {
    if (!publicKey) return;
    setAddingHub(true);
    setAddHubError(null);
    try {
      const token = await authenticateWithPasskey(hubUrl, publicKey);
      const hub = await addHub(hubUrl, stableHandlers, {
        invite_code: inviteCode || undefined,
        sessionToken: token,
      });
      setHubs(listHubs());
      setActiveHubIdState(hub.hub_id);
      setShowAddHub(false);
      setHubUrl("");
      setInviteCode("");
      setHubPreview({ state: "idle" });
      await loadHubData();
      publishDhKey().catch(() => {});
      const target = pendingDeepLinkTargetRef.current;
      if (target) {
        pendingDeepLinkTargetRef.current = null;
        await applyDeepLinkTarget(hub.hub_id, target);
      }
    } catch (e) {
      setAddHubError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setAddingHub(false);
    }
  }

  async function handleSaveFirstRunName() {
    const name = firstRunName.trim();
    if (!name) { setShowDisplayNamePrompt(false); return; }
    try {
      await hubFetch("/me", { method: "PATCH", body: JSON.stringify({ display_name: name }) });
      setMeInfo((prev) => prev ? { ...prev, display_name: name } : prev);
    } catch { /* non-critical, ignore */ }
    setShowDisplayNamePrompt(false);
  }

  // === Channel / messages ===

  async function handleCreateChannel(name: string, channelType: string, isCategory: boolean, description: string, spawnerNameTemplate?: string, banner?: { url?: string; file?: File | null }) {
    if (!createChannelCtx) return;
    setCreateChannelLoading(true);
    setCreateChannelError(null);
    try {
      const res = await hubFetch("/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parent_id: createChannelCtx.parentId ?? undefined,
          is_category: isCategory,
          channel_type: isCategory ? undefined : channelType,
          description: description || undefined,
          spawner_name_template: !isCategory && channelType === "spawner" ? spawnerNameTemplate : undefined,
          banner_url: channelType === "banner" ? banner?.url : undefined,
        }),
      });
      // Hub-uploaded banner (banner-channels.md §upload flow): the channel
      // must exist first, then the image is uploaded to it, then the channel
      // is patched with the returned file id.
      if (channelType === "banner" && banner?.file) {
        const created = (await res.json()) as Channel;
        const uploaded = await uploadFile(created.id, banner.file);
        await hubFetch(`/channels/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ banner_file_id: uploaded.id }),
        });
      }
      setCreateChannelCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setCreateChannelError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setCreateChannelLoading(false);
    }
  }

  async function handleSaveChannelSettings(name: string, description: string, color?: string | null, icon?: string | null, banner?: { url?: string; file?: File | null }) {
    if (!channelSettingsCtx) return;
    setChannelSettingsSaving(true);
    setChannelSettingsError(null);
    try {
      // A replacement banner image is uploaded first so its file id can ride
      // the same PATCH as the rest (the hub clears the other source column).
      let bannerFileId: string | undefined;
      if (banner?.file) {
        bannerFileId = (await uploadFile(channelSettingsCtx.id, banner.file)).id;
      }
      await hubFetch(`/channels/${channelSettingsCtx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // color/icon are appearance fields (require manage_channel_icons);
        // only sent when provided so a plain rename doesn't touch them.
        body: JSON.stringify({
          name,
          description: description || null,
          color,
          icon,
          banner_url: banner?.url,
          banner_file_id: bannerFileId,
        }),
      });
      setChannelSettingsCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setChannelSettingsError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setChannelSettingsSaving(false);
    }
  }

  async function handleRenameRoom() {
    if (!renameRoomCtx || !renameRoomName.trim()) return;
    setRenameRoomSaving(true);
    setRenameRoomError(null);
    try {
      await hubFetch(`/channels/${renameRoomCtx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Name ONLY: the server's temp-room owner grant covers exactly a
        // bare rename; any other field would require manage_channels.
        body: JSON.stringify({ name: renameRoomName.trim() }),
      });
      setRenameRoomCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setRenameRoomError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setRenameRoomSaving(false);
    }
  }

  async function handleDeleteChannel() {
    if (!channelSettingsCtx) return;
    setChannelSettingsDeleting(true);
    setChannelSettingsError(null);
    try {
      await hubFetch(`/channels/${channelSettingsCtx.id}`, { method: "DELETE" });
      if (selectedChannel?.id === channelSettingsCtx.id) setSelectedChannel(null);
      setChannelSettingsCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setChannelSettingsError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setChannelSettingsDeleting(false);
    }
  }

  async function handleSelectChannel(ch: Channel) {
    setSelectedChannel(ch);
    setSelectedConversation(null);
    clearSelectedAllianceChannel();
    setView("channels");
    setMessages([]);
    setReplyTarget(null);
    setEditingMessageId(null);
    if (activeHubId) {
      clearUnread(activeHubId, ch.id);
      setInputText(loadDraft(`${activeHubId}/${ch.id}`));
    } else {
      setInputText("");
    }
    markChannelRead(ch.id).catch(() => {});
    // Channels created after the WS connected are not in the hub's
    // auto-subscribe set; subscribing is idempotent for the rest.
    subscribeChannel(ch.id).catch(() => {});
    try {
      const msgs = await getMessages(ch.id);
      setMessages(msgs);
      setStickToBottom(true);
      setNewWhileScrolledUp(0);
    } catch {}
  }

  function handleSelectAllianceChannel(alliance: AllianceInfo, channel: AllianceSharedChannel) {
    setSelectedChannel(null);
    setSelectedConversation(null);
    setView("channels");
    setInputText("");
    setReplyTarget(null);
    setEditingMessageId(null);
    void selectAllianceChannel(alliance, channel);
  }

  async function handleSendAllianceMessage() {
    if (!selectedAllianceChannel || !inputText.trim()) return;
    const text = inputText;
    setInputText("");
    await sendAllianceMessage(text);
  }

  // Expands whatever ancestor categories are collapsed so a breadcrumb
  // category crumb (nested-channels-ux.md §1.4) becomes visible, then
  // scrolls the sidebar to it.
  function handleBreadcrumbCategoryClick(categoryId: string) {
    const hubId = activeHubId;
    if (!hubId) return;
    const ancestorsAbove = channelPath(channels, categoryId).slice(0, -1);
    if (ancestorsAbove.length > 0) {
      setCollapsedCategories((prev) => {
        const m = { ...(prev[hubId] ?? {}) };
        let changed = false;
        for (const anc of ancestorsAbove) {
          if (m[anc.id]) { delete m[anc.id]; changed = true; }
        }
        return changed ? { ...prev, [hubId]: m } : prev;
      });
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`sidebar-node-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  async function handleChannelDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const forbidden = descendantIds(channelTree, activeId);
    if (forbidden.has(overId)) return;

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

    const channelsWithNewParent = parentChanged
      ? channels.map((c) => (c.id === activeId ? { ...c, parent_id: newParentId } : c))
      : channels;

    const sorted = [...channelsWithNewParent].sort((a, b) => a.display_order - b.display_order);
    const oldIndex = sorted.findIndex((c) => c.id === activeId);
    const newIndex = sorted.findIndex((c) => c.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex);
    setChannels(reordered.map((c, i) => ({ ...c, display_order: i })));

    try {
      const { moveChannel, reorderChannels } = await import("./platform/commands/hubAdmin");
      if (parentChanged) {
        await moveChannel(activeId, newParentId);
      }
      await reorderChannels(reordered.map((c) => c.id));
    } catch { /* optimistic — ignore network errors */ }
  }

  async function handleSend() {
    if (!selectedChannel || !inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    if (activeHubId) clearDraft(`${activeHubId}/${selectedChannel.id}`);
    try {
      await sendMessage(selectedChannel.id, text, pendingAttachments.length ? pendingAttachments : undefined, replyTarget?.id);
      setPendingAttachments([]);
      setReplyTarget(null);
    } catch {}
  }

  async function handleSaveEdit() {
    if (!editingMessageId || !editingDraft.trim() || !selectedChannel) return;
    try {
      await editMessage(selectedChannel.id, editingMessageId, editingDraft.trim());
      setEditingMessageId(null);
      setEditingDraft("");
    } catch {}
  }

  function handleCancelEdit() { setEditingMessageId(null); setEditingDraft(""); }

  function handleStartEdit(msg: Message) {
    setEditingMessageId(msg.id);
    setEditingDraft(msg.content);
  }

  async function handleDeleteMessage(msgId: string) {
    if (!selectedChannel) return;
    try {
      await deleteMessage(selectedChannel.id, msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch {}
  }

  async function handleToggleReaction(msgId: string, emoji: string) {
    if (!selectedChannel) return;
    const msg = messages.find((m) => m.id === msgId);
    const existing = msg?.reactions?.find((r) => r.emoji === emoji);
    try {
      if (existing?.me) await removeReaction(selectedChannel.id, msgId, emoji);
      else await addReaction(selectedChannel.id, msgId, emoji);
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
    if (e.key === "Escape") { setReplyTarget(null); setEditingMessageId(null); }
  }

  // === DMs ===

  async function handleSelectConversation(conv: Conversation) {
    setSelectedConversation(conv);
    setSelectedChannel(null);
    setView("dms");
    setUnreadDms((prev) => { const n = { ...prev }; delete n[conv.id]; return n; });
    if (!dmMessages[conv.id]) {
      try {
        const msgs = await getDmMessages(conv.id);
        const asDmMessages: DmMessage[] = msgs.map((m) => ({
          id: m.id,
          sender: m.sender,
          sender_name: m.sender_name,
          content: m.content,
          timestamp: m.created_at,
          attachments: m.attachments,
          is_encrypted: m.is_encrypted,
          delivery_failed: m.delivery_failed,
        }));
        setDmMessages((prev) => ({ ...prev, [conv.id]: asDmMessages }));
      } catch {}
    }
  }

  // The hub dedupes 1:1 DMs server-side (create_conversation returns the
  // existing conversation instead of a duplicate), so this is safe to call
  // even if a conversation with this member already exists locally.
  async function handleStartConversation(pubkey: string) {
    try {
      const conv = await createConversation([pubkey]);
      setConversations((prev) => prev.some((c) => c.id === conv.id)
        ? prev.map((c) => c.id === conv.id ? conv : c)
        : [conv, ...prev]);
      await handleSelectConversation(conv);
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  async function handleSendDm() {
    if (!selectedConversation || !inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    try {
      await sendDm(selectedConversation.id, text);
    } catch (e) {
      // Losing the message silently is worse than any error: put the text
      // back in the composer and surface what happened.
      setInputText(text);
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  // === Voice ===

  async function handleVoiceJoin(targetChannelId: string) {
    // Already in this exact voice channel — nothing to do. Read via the ref
    // (not the voiceChannelId state) so this guard is correct even when
    // called from the frozen onVoiceMove WS handler (stableHandlers memo).
    if (voiceChannelIdRef.current === targetChannelId) return;
    // Switching channels: tear down the current session FIRST. Without this,
    // repeated joins stack independent VoiceWsSessions (joining several rooms
    // at once) and only the last is tracked, so leaving leaves the earlier
    // ones connected as stale roster entries that block temp-channel cleanup.
    // stop() sets closed=true before closing the socket, so the old session's
    // onClose does not fire and cannot clobber the new session's state.
    if (voiceSessionRef.current) {
      videoSessionRef.current?.dispose();
      videoSessionRef.current = null;
      backgroundProcessorRef.current?.stop();
      backgroundProcessorRef.current = null;
      voiceSessionRef.current.stop();
      voiceSessionRef.current = null;
      try { activeSession().ws?.unwatchVoice(); } catch {}
    }
    try {
      const sess = activeSession();
      const session = new VoiceWsSession(sess.hub_url, sess.token, targetChannelId, {
        // `channelId` is where the join actually landed — for a spawner
        // channel the hub creates a personal sibling room and the join
        // lands there instead, never in the spawner itself.
        onReady: (_senderId, _participants, channelId) => {
          setVoiceChannelId(channelId);
          if (voiceSoundsOn()) { try { playVoiceTone("up"); } catch { /* audio not ready */ } }
          setSelfMuted(false);
          setSelfDeafened(false);
          const me = meInfoRef.current;
          if (me) {
            setVoicePartByChannel((prev) => {
              const existing = prev[channelId] ?? [];
              if (existing.some((p) => p.public_key === me.public_key)) return prev;
              return { ...prev, [channelId]: [...existing, { public_key: me.public_key, display_name: me.display_name }] };
            });
          }
          try { activeSession().ws?.watchVoice(channelId); } catch {}
          // Spin up the video session now (camera off) so it catches the
          // hub's video_participants roster pushed at voice-join.
          const vws = activeSession().ws;
          const myPk = publicKeyRef.current;
          if (vws && myPk) {
            videoSessionRef.current = new WebVideoSession(vws, channelId, myPk, {
              onRemoteStream: (pk, s) => setRemoteVideoStreams((prev) => new Map(prev).set(pk, s)),
              onPeerGone: (pk) => setRemoteVideoStreams((prev) => { const n = new Map(prev); n.delete(pk); return n; }),
            });
          }
          if (channelId !== targetChannelId) {
            hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
          }
        },
        onClose: () => {
          voiceSessionRef.current = null;
          videoSessionRef.current?.dispose();
          videoSessionRef.current = null;
          backgroundProcessorRef.current?.stop();
          backgroundProcessorRef.current = null;
          setVoiceChannelId(null);
          setVoiceChannelNameHint(null);
          setLocalVideoStream(null);
          setRemoteVideoStreams(new Map());
          setVideoEnabled(false);
          setSelfMuted(false);
          setSelfDeafened(false);
          try { activeSession().ws?.unwatchVoice(); } catch {}
        },
      }, loadVoiceAudioProfile());
      await session.start();
      voiceSessionRef.current = session;
    } catch (e) {
      showHubError("Voice: " + String(e));
    }
  }

  async function handleStartShare() {
    if (!selectedChannel || sharing) return;
    const ws = activeSession().ws;
    if (!ws) { showHubError("Not connected"); return; }
    const session = new WebScreenShareSession(ws, selectedChannel.id, {
      onBitrate: (kbps) => setShareKbps(kbps),
      onEnded: () => {
        screenShareSessionRef.current = null;
        setSharing(false);
        setShareKbps(0);
        setShareLocalStream(null);
      },
      onError: (msg) => showHubError("Screen share: " + msg),
    });
    try {
      await session.start();
      screenShareSessionRef.current = session;
      setSharing(true);
      setShareLocalStream(session.getStream());
    } catch (e) {
      // getDisplayMedia rejects when the user cancels the picker — not an error.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/denied|cancel|aborted|not allowed/i.test(msg)) showHubError("Screen share: " + msg);
    }
  }

  function handleStopShare() {
    screenShareSessionRef.current?.stop();
    screenShareSessionRef.current = null;
    setSharing(false);
    setShareKbps(0);
    setShareLocalStream(null);
  }

  function handleOpenHubStreams() {
    try { activeSession().ws?.requestStreamList(); } catch {}
    setShowHubStreams(true);
  }
  function handleWatchStream(channelId: string, streamId: string) {
    try { activeSession().ws?.subscribeStream(channelId, streamId); } catch {}
  }
  function handleStopWatchStream(channelId: string, streamId: string) {
    try { activeSession().ws?.unsubscribeStream(channelId, streamId); } catch {}
    subscribedStreamIds.current.delete(streamId);
    setActiveScreenShares((prev) => prev.filter((s) => s.stream_id !== streamId));
    screenShareViewerRef.current?.stopStream(streamId);
  }

  async function handleToggleVideo() {
    if (videoEnabled) { handleStopVideo(); return; }
    // Video is scoped to the voice channel you're in; the session was created
    // on voice-join so it already knows the participant roster.
    if (!voiceChannelId || !videoSessionRef.current) {
      showHubError("Join voice first to turn on your camera.");
      return;
    }
    try {
      // Honor the camera chosen in Settings → Voice, if any.
      let camId: string | null = null;
      try { camId = localStorage.getItem("wavvon.videoInputDevice"); } catch { /* ignore */ }
      const raw = await navigator.mediaDevices.getUserMedia({
        video: camId ? { deviceId: { exact: camId } } : true,
        audio: false,
      });
      // Apply the chosen background effect (blur/image/video), if any, by
      // routing the raw camera through the segmentation compositor and sending
      // its processed stream instead.
      let stream = raw;
      const mode = loadBgMode();
      if (mode !== "none") {
        try {
          const proc = new BackgroundProcessor(raw);
          stream = await proc.start(mode, loadBgSource());
          backgroundProcessorRef.current = proc;
        } catch {
          stream = raw; // effect failed to init — fall back to the plain camera
        }
      }
      videoSessionRef.current.enable(stream);
      setLocalVideoStream(stream);
      setVideoEnabled(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/denied|not allowed|dismiss/i.test(msg)) showHubError("Camera: " + msg);
    }
  }

  function handleStopVideo() {
    // Keep the session alive (it tracks the roster) — just turn the camera off.
    videoSessionRef.current?.disable();
    backgroundProcessorRef.current?.stop();
    backgroundProcessorRef.current = null;
    setLocalVideoStream(null);
    setRemoteVideoStreams(new Map());
    setVideoEnabled(false);
  }

  // Live background-effect changes from Settings while the camera is on:
  // re-run the capture pipeline so the new effect (or none) takes hold.
  useEffect(() => {
    const onChange = () => {
      if (videoEnabledRef.current) {
        handleStopVideo();
        void handleToggleVideo();
      }
    };
    window.addEventListener("wavvon:bgchange", onChange);
    return () => window.removeEventListener("wavvon:bgchange", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStartWhisper(targetPubkeys: string[]) {
    if (!voiceChannelId || targetPubkeys.length === 0) return;
    const ws = activeSession().ws;
    if (!ws) { showHubError("Not connected"); return; }
    ws.startWhisper(targetPubkeys.map((id) => ({ type: "user", id })));
    setWhisperingTo(targetPubkeys);
  }

  function handleStopWhisper() {
    try { activeSession().ws?.stopWhisper(); } catch {}
    setWhisperingTo([]);
  }

  function handleVoiceLeave() {
    if (voiceChannelId && voiceSoundsOn()) { try { playVoiceTone("down"); } catch { /* audio not ready */ } }
    const channelId = voiceChannelId;
    // Camera + whisper are scoped to the voice session — tear them down too.
    videoSessionRef.current?.dispose();
    videoSessionRef.current = null;
    backgroundProcessorRef.current?.stop();
    backgroundProcessorRef.current = null;
    setLocalVideoStream(null);
    setRemoteVideoStreams(new Map());
    setVideoEnabled(false);
    if (whisperingTo.length > 0) handleStopWhisper();
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    setVoiceChannelId(null);
    setVoiceChannelNameHint(null);
    setSelfMuted(false);
    setSelfDeafened(false);
    try { activeSession().ws?.unwatchVoice(); } catch {}
    const me = meInfoRef.current;
    if (me && channelId) {
      setVoicePartByChannel((prev) => {
        const existing = prev[channelId];
        if (!existing) return prev;
        const next = existing.filter((p) => p.public_key !== me.public_key);
        if (next.length === 0) {
          const { [channelId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [channelId]: next };
      });
    }
  }

  // Mover's side: right-click "Move to channel…" (events.md §7.1) and the
  // event staging panel (§7.5, eventId set) both funnel through here.
  function handleMoveMember(targetPubkey: string, targetChannelId: string, eventId?: string) {
    const ws = activeSession().ws;
    if (!ws) { showHubError("Not connected"); return; }
    ws.sendVoiceMove(targetPubkey, targetChannelId, eventId);
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
    // The source is a channel we were just in — no name hint needed, the
    // local channel list already knows it.
    void handleVoiceJoin(sourceChannelId);
  }

  function handleAcceptVoiceMove() {
    if (!voiceMovePrompt) return;
    const { targetChannelId, targetChannelName } = voiceMovePrompt;
    setVoiceMovePrompt(null);
    setVoiceChannelNameHint(targetChannelName);
    void handleVoiceJoin(targetChannelId);
  }

  // Decline is a server no-op (events.md §7.2) — closing the prompt is the
  // entire client side of it, nothing to send.
  function handleDeclineVoiceMove() {
    setVoiceMovePrompt(null);
  }

  function handleToggleMute() {
    const next = !selfMuted;
    setSelfMuted(next);
    voiceSessionRef.current?.setMuted(next);
  }

  function handleToggleDeafen() {
    const next = !selfDeafened;
    setSelfDeafened(next);
    if (next) setSelfMuted(true);
    voiceSessionRef.current?.setDeafened(next);
  }

  const handleSetVoiceGain = useCallback((pk: string, gainPct: number) => {
    setVoiceGains((prev) => {
      const next = { ...prev, [pk]: gainPct };
      try { setScoped("wavvon.voice_gains", JSON.stringify(next)); } catch {}
      return next;
    });
    voiceSessionRef.current?.setSenderGain(pk, gainPct);
  }, []);

  // Triggers a soundboard clip (soundboard.md §1): decode it via the same
  // browser Opus decoder used for playback, mix it into the outgoing voice
  // stream ahead of Opus encoding, then POST the attribution event. The
  // session itself is the "one clip at a time" enforcement (playClip
  // refuses while one is already queued); soundboardPlayingClipId only
  // drives the popover's disabled state.
  async function handleTriggerSoundboardClip(clip: SoundboardClip) {
    const session = voiceSessionRef.current;
    if (!session || !voiceChannelId) return;
    if (session.getPlayingClipId()) return;
    try {
      const bytes = await fetchSoundboardAudioBytes(clip.id);
      const pcm = await session.decodeClipPcm(bytes);
      if (!session.playClip(clip.id, pcm)) return;
      setSoundboardPlayingClipId(clip.id);
      const durationMs = (pcm.length / 48000) * 1000;
      setTimeout(() => {
        setSoundboardPlayingClipId((cur) => (cur === clip.id ? null : cur));
      }, durationMs + 200);
      await markSoundboardPlayed(clip.id, voiceChannelId);
    } catch (e) {
      showHubError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  const channelTypingByKey = useMemo(() => {
    if (!selectedChannel) return {} as Record<string, { name: string; ts: number }>;
    const prefix = `${selectedChannel.id}:`;
    const out: Record<string, { name: string; ts: number }> = {};
    for (const [k, v] of Object.entries(typingByKey)) {
      if (k.startsWith(prefix)) out[k] = v;
    }
    return out;
  }, [typingByKey, selectedChannel]);

  const convTypingByKey = useMemo(() => {
    if (!selectedConversation) return {} as Record<string, { name: string; ts: number }>;
    const prefix = `${selectedConversation.id}:`;
    const out: Record<string, { name: string; ts: number }> = {};
    for (const [k, v] of Object.entries(dmTypingByKey)) {
      if (k.startsWith(prefix)) out[k] = v;
    }
    return out;
  }, [dmTypingByKey, selectedConversation]);

  const isAdmin = useMemo(
    () => meInfo?.roles?.some((r) => r.permissions?.includes("admin")) ?? false,
    [meInfo],
  );

  const canManageRoles = useMemo(
    () => meInfo?.roles?.some((r) => r.permissions?.includes("admin") || r.permissions?.includes("manage_roles")) ?? false,
    [meInfo],
  );

  // Gates the voice roster's "Move to channel…" entry (events.md §7.1). The
  // hub re-checks channel-scoped against the destination on every voice_move —
  // this is UX-only, same posture as the other client-side permission gates here.
  const canMoveMembers = useMemo(
    () => meInfo?.roles?.some((r) => r.permissions?.includes("admin") || r.permissions?.includes("move_members")) ?? false,
    [meInfo],
  );

  const voiceMoveChannelOptions = useMemo(
    () => moveChannelOptions(channels).filter((c) => c.id !== voiceMoveMenu?.currentChannelId),
    [channels, voiceMoveMenu],
  );

  // Same permission the invite endpoints require (routes/invites.rs) — gates
  // the "Invite people" entry for non-admin members too.
  const canCreateInvites = useMemo(
    () => isAdmin || (meInfo?.roles?.some((r) => r.permissions?.includes("manage_channels")) ?? false),
    [isAdmin, meInfo],
  );

  // Same permission the poll-create endpoint requires (SEND_MESSAGES) —
  // gates the "Create poll" context-menu entry the same way the composer's
  // own "+" attach menu is implicitly gated (anyone who can post here).
  const canSendMessages = useMemo(
    () => meInfo?.roles?.some((r) => r.permissions?.includes("admin") || r.permissions?.includes("send_messages")) ?? false,
    [meInfo],
  );

  // Channel-scoped effective permissions for the joined voice channel, from
  // GET /channels/:id/my-permissions (self-service, no manage_roles needed).
  // Null while unjoined, loading, or on fetch failure — callers fall back to
  // the hub-wide role baseline then; the server check stays authoritative.
  const [myVoicePerms, setMyVoicePerms] = useState<MyChannelPermissions | null>(null);
  useEffect(() => {
    if (!voiceChannelId) { setMyVoicePerms(null); return; }
    let cancelled = false;
    getMyChannelPermissions(voiceChannelId)
      .then((p) => { if (!cancelled) setMyVoicePerms(p); })
      .catch(() => { if (!cancelled) setMyVoicePerms(null); });
    return () => { cancelled = true; };
  }, [voiceChannelId]);

  const canUseSoundboard = useMemo(() => {
    if (myVoicePerms && myVoicePerms.channel_id === voiceChannelId) {
      return myVoicePerms.is_admin || myVoicePerms.permissions.includes("use_soundboard");
    }
    return meInfo?.roles?.some((r) => r.permissions?.includes("admin") || r.permissions?.includes("use_soundboard")) ?? false;
  }, [myVoicePerms, voiceChannelId, meInfo]);

  const canManageSoundboard = useMemo(
    () => meInfo?.roles?.some((r) => r.permissions?.includes("admin") || r.permissions?.includes("manage_soundboard")) ?? false,
    [meInfo],
  );

  const myRoles = useMemo(() => meInfo?.roles ?? [], [meInfo]);

  // Highest priority among the viewer's own roles — the hub only lets you
  // assign/remove roles strictly below your own priority.
  const myMaxPriority = useMemo(
    () => myRoles.reduce((m, r) => Math.max(m, r.priority), 0),
    [myRoles],
  );

  const knownDisplayNames = useMemo(
    () => new Set(users.map((u) => u.display_name).filter(Boolean) as string[]),
    [users],
  );

  const channelTree = useMemo<TreeNode[]>(
    () => buildChannelTree(channels),
    [channels],
  );

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
        const r = await searchMessages(selectedChannel.id, q);
        if (!cancelled) setSearchResults(r);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, selectedChannel]);

  useEffect(() => {
    if (hubs.length === 0) return;
    let cancelled = false;
    async function tick() {
      for (const h of hubs) {
        if (cancelled) return;
        try {
          const { pingHub } = await import("./platform/commands/hubs");
          const ms = await pingHub(h.hub_id);
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: ms }));
        } catch {
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: null }));
        }
      }
    }
    void tick();
    const interval = setInterval(() => { void tick(); }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubs.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if (mod && e.key === "/") {
        e.preventDefault();
        setShowKeyboardShortcuts((v) => !v);
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearchBar((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (mod && e.key === "ArrowDown") {
        e.preventDefault();
        setActiveHubIdState((prev) => {
          const idx = hubs.findIndex((h) => h.hub_id === prev);
          const next = hubs[idx + 1];
          return next ? next.hub_id : prev;
        });
        return;
      }
      if (mod && e.key === "ArrowUp") {
        e.preventDefault();
        setActiveHubIdState((prev) => {
          const idx = hubs.findIndex((h) => h.hub_id === prev);
          const next = hubs[idx - 1];
          return next ? next.hub_id : prev;
        });
        return;
      }
      if (!inInput && e.key === "/") {
        e.preventDefault();
        messageInputRef.current?.focus();
        return;
      }
      if (e.altKey && (e.code === "ArrowDown" || e.code === "ArrowUp")) {
        e.preventDefault();
        const hubId = activeHubIdRef.current;
        const unreadSet = hubId ? (unreadByChannel[hubId] ?? {}) : {};
        const visibleChannels = channels.filter((c) => !c.is_category);
        const unreadChannels = visibleChannels.filter((c) => unreadSet[c.id]);
        const pool = unreadChannels.length > 0 ? unreadChannels : visibleChannels;
        const idx = pool.findIndex((c) => c.id === selectedChannel?.id);
        const next = e.code === "ArrowDown"
          ? pool[(idx + 1) % pool.length]
          : pool[(idx - 1 + pool.length) % pool.length];
        if (next) void handleSelectChannel(next);
        return;
      }
      if (e.key === "Escape" && !inInput) {
        if (showKeyboardShortcuts) { setShowKeyboardShortcuts(false); return; }
        if (showSettings) { setShowSettings(false); return; }
        if (showHubAdmin) { setShowHubAdmin(false); return; }
        if (showFarmSettings) { setShowFarmSettings(false); return; }
        if (showCreateHub) { setShowCreateHub(false); return; }
        if (showAddHub) { setShowAddHub(false); return; }
        if (showQuickInvite) { setShowQuickInvite(false); return; }
        if (showSearchBar) { setShowSearchBar(false); return; }
        if (searchOpen) { setSearchOpen(false); return; }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hubs, channels, selectedChannel, messageInputRef, unreadByChannel, showKeyboardShortcuts, showSettings, showHubAdmin, showFarmSettings, showCreateHub, showAddHub, showQuickInvite, showSearchBar, searchOpen]);

  // === Render ===

  if (ready === "checking") {
    return <div style={{ padding: 32 }}>Loading…</div>;
  }

  if (ready === "setup") {
    return <IdentitySetupScreen onComplete={handleIdentityComplete} />;
  }

  // With zero hubs joined, "channels" view has nothing to show — force the
  // rail into the DM/friends view so the shell chrome (footer identity,
  // friends button, +add-hub) stays meaningful instead of showing an empty
  // hub header.
  const hasNoHubs = hubs.length === 0;
  const sidebarView = hasNoHubs ? "dms" : view;
  const notifyModeLabels: Record<NotifyMode, string> = {
    all: t("hub.notifications.all"),
    mentions: t("hub.notifications.mentions"),
    silent: t("hub.notifications.silent"),
  };

  return (
    <div className="main-layout">
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
      {hubErrorToast && (
        <div
          style={{
            position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)",
            background: "var(--surface)", border: "1px solid var(--danger, #e05252)",
            borderRadius: "var(--r-md)", padding: "8px 16px", zIndex: 9999,
            fontSize: "var(--text-sm)", color: "var(--danger, #e05252)",
          }}
        >
          {hubErrorToast}
        </div>
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

      {sharing && (
        <ScreenShareSelfPreview
          stream={shareLocalStream}
          kbps={shareKbps}
          onStop={handleStopShare}
        />
      )}

      {showKeyboardShortcuts && (
        <KeyboardShortcuts onClose={() => setShowKeyboardShortcuts(false)} />
      )}

      {showDiscover && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--bg, #1a1a2e)", overflow: "auto" }}>
          <DiscoverPage
            onClose={() => setShowDiscover(false)}
            onJoinHub={(hubUrl, inviteCode) => {
              setHubUrl(hubUrl);
              setInviteCode(inviteCode);
              setShowDiscover(false);
              setShowAddHub(true);
            }}
          />
        </div>
      )}

      {showSearchBar && (
        <SearchBar
          hubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
          activeChannelId={selectedChannel?.id}
          onClose={() => setShowSearchBar(false)}
          onNavigate={(channelId, _messageId) => {
            const ch = channels.find((c) => c.id === channelId);
            if (ch) void handleSelectChannel(ch);
            setShowSearchBar(false);
          }}
        />
      )}

      {showFriends && (
        <FriendsModal onClose={() => setShowFriends(false)} onToast={(msg) => showHubError(msg)} />
      )}

      {showHubStreams && (
        <HubStreamsPanel
          streams={hubStreams}
          subscribedIds={subscribedStreamIds.current}
          currentChannelId={selectedChannel?.id ?? null}
          channels={channels}
          nameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
          onWatch={handleWatchStream}
          onStopWatch={handleStopWatchStream}
          onClose={() => setShowHubStreams(false)}
        />
      )}

      {surveyToShow && (
        <SurveyModal
          survey={surveyToShow}
          onDone={() => { surveyDismissedRef.current.add(surveyToShow.id); setSurveyToShow(null); }}
          onSkip={() => { surveyDismissedRef.current.add(surveyToShow.id); setSurveyToShow(null); }}
        />
      )}

      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--bg, #1a1a2e)", overflow: "auto", display: "flex" }}>
          <SettingsPage
            tab={settingsTab}
            onTab={setSettingsTab}
            onClose={() => setShowSettings(false)}
            hubs={hubs}
            publicKey={publicKey}
            theme={theme}
            onThemeChange={handleSetTheme}
            skin={skin}
            onSkinChange={handleSkinChange}
            customThemes={customThemes}
            activeCustomThemeId={activeCustomThemeId}
            onApplyCustomTheme={handleApplyCustomTheme}
            onNewCustomTheme={handleNewCustomTheme}
            onRenameCustomTheme={handleRenameCustomTheme}
            onDuplicateCustomTheme={handleDuplicateCustomTheme}
            onDeleteCustomTheme={handleDeleteCustomTheme}
            onImportSkin={handleImportCustomTheme}
            onHubProfileSaved={handleHubProfileSaved}
            mentionPingEnabled={mentionPingEnabled}
            onMentionPingChange={(v) => {
              setMentionPingEnabled(v);
              try { setScoped("wavvon.mentionPing", v ? "1" : "0"); } catch {}
            }}
            recoveryPhrase={recoveryPhrase}
            onShowRecovery={handleShowRecovery}
            blocks={Array.from(blockedUsers).map((p) => ({ pubkey: p, since: 0 }))}
            ignores={Array.from(ignoredUsers).map((p) => ({ pubkey: p, since: 0 }))}
            onUnblock={toggleBlockUser}
            onUnignore={toggleIgnoreUser}
            knownNames={pubkeyToName}
            inVoice={voiceChannelId !== null}
          />
        </div>
      )}

      {userContextMenu && (
        <UserContextMenu
          pubkey={userContextMenu.pubkey}
          displayName={userContextMenu.displayName}
          isAdmin={isAdmin}
          canManageRoles={canManageRoles}
          myMaxPriority={myMaxPriority}
          position={userContextMenu.position}
          onClose={() => setUserContextMenu(null)}
          onToast={(msg) => showHubError(msg)}
          onRolesChanged={() => {
            hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
          }}
        />
      )}

      {voiceChannelId && (videoEnabled || remoteVideoStreams.size > 0) && (
        <VideoPipWindow
          title={`#${channels.find((c) => c.id === voiceChannelId)?.name ?? "voice"}`}
          localStream={localVideoStream}
          remoteStreams={remoteVideoStreams}
          nameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
        />
      )}

      {showFarmSettings && (
        <FarmSettingsPage
          farmUrl={farmAdminUrl}
          tab={farmAdminTab}
          onTab={setFarmAdminTab}
          onClose={() => setShowFarmSettings(false)}
        />
      )}

      {showCreateHub && (
        <CreateHubFork
          knownFarms={knownFarms}
          wsHandlers={stableHandlers}
          onHubCreated={(hub) => {
            setHubs((prev) => {
              if (prev.some((h) => h.hub_id === hub.hub_id)) return prev;
              return [...prev, hub];
            });
            setActiveHubIdState(hub.hub_id);
            setShowCreateHub(false);
          }}
          discoveryNewUrl={DISCOVERY_NEW_HUB_URL}
          setupCommand={HUB_SETUP_COMMAND}
          inviteValue={hubUrl}
          onInviteChange={handleHubUrlInput}
          inviteLoading={addingHub}
          inviteError={addHubError}
          onRedeemInvite={handleAddHub}
          onClose={() => {
            setShowCreateHub(false);
            setHubUrl("");
            setInviteCode("");
            setHubPreview({ state: "idle" });
            setAddHubError(null);
          }}
        />
      )}

      <MobileShell
        showHubSidebar
        showChannelSidebar
        showContent
        onBack={() => {}}
      >
      <HubSidebar
        hubs={hubs}
        activeHubId={activeHubId}
        view={sidebarView as "channels" | "dms"}
        showDiscover={true}
        unreadDms={unreadDms}
        unreadByHub={unreadByHub}
        pingByHub={pingByHub}
        hubNotifyMode={hubNotifyMode}
        lobbyHubIds={lobbyHubs}
        hasActiveHub={!!activeHubId}
        isFarmAdmin={isFarmAdmin}
        onSwitchToDms={() => setView("dms")}
        onSwitchHub={handleSwitchHub}
        onRemoveHub={handleRemoveHub}
        onHubReorder={handleHubReorder}
        onAddHub={() => setShowAddHub(true)}
        onCreateHub={() => setShowCreateHub(true)}
        onDiscover={() => setShowDiscover(true)}
        onFarmSettings={() => { setShowFarmSettings(true); setFarmAdminTab("general"); }}
      />

      <ChannelSidebar
        view={sidebarView as "channels" | "dms"}
        activeHubId={activeHubId}
        hubs={hubs}
        channels={channels}
        selectedChannel={selectedChannel}
        unreadByChannel={unreadByChannel}
        collapsedCategories={collapsedCategories}
        voicePartByChannel={voicePartByChannel}
        voiceChannelId={voiceChannelId}
        voiceChannelNameHint={voiceChannelNameHint}
        selfMuted={selfMuted}
        selfDeafened={selfDeafened}
        users={users}
        publicKey={publicKey}
        pingByHub={pingByHub}
        isAdmin={isAdmin}
        canCreateInvites={canCreateInvites}
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
        onToggleCategoryCollapsed={(hubId, catId) =>
          setCollapsedCategories((prev) => {
            const m = { ...(prev[hubId] ?? {}) };
            if (m[catId]) delete m[catId]; else m[catId] = true;
            return { ...prev, [hubId]: m };
          })
        }
        onHubDropdownOpenChange={setHubDropdownOpen}
        onSetHubMode={(hubId, mode) =>
          setHubNotifyMode((prev) => { const n = { ...prev }; if (mode === "all") delete n[hubId]; else n[hubId] = mode; return n; })
        }
        onToggleHideSilenced={toggleHideSilenced}
        onClearHubUnread={clearHubUnread}
        onRemoveHub={handleRemoveHub}
        onOpenHubAdmin={() => void openHubAdmin()}
        onOpenHubAdminInvites={() => { void openHubAdmin(); setHubAdminTab("invites"); }}
        onOpenQuickInvite={() => setShowQuickInvite(true)}
        onOpenCreateChannel={(parentId, isCategory) => { setCreateChannelCtx({ parentId, isCategory }); setCreateChannelError(null); }}
        onSelectChannel={handleSelectChannel}
        onChannelContextMenu={(e, channel) => { e.preventDefault(); setChannelCtxMenu({ channel, x: e.clientX, y: e.clientY }); }}
        canOpenChannelSettings={isAdmin || canManageRoles}
        myStatus={myPresence.status === "online" ? null : myPresence.status}
        onSetStatus={(status, ttlMinutes) => {
          if (presenceTtlRef.current) { clearTimeout(presenceTtlRef.current); presenceTtlRef.current = null; }
          const apply = (s: PresenceStatus) => {
            setMyPresence({ status: s });
            try { sendSetStatus(s, null); } catch { /* ws not ready */ }
            // Optimistic: the hubs' member_status broadcasts will confirm.
            // Invisible shows the user offline (to everyone, incl. their own
            // roster view); the footer picker still reflects "invisible".
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
        }}
        onOpenChannelSettings={(channel) => { setChannelSettingsCtx(channel); setChannelSettingsError(null); }}
        onVoiceJoin={(ch) => ch && void handleVoiceJoin(ch.id)}
        onVoiceLeave={handleVoiceLeave}
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
        onSelectAllianceChannel={handleSelectAllianceChannel}
        onOpenFriends={() => setShowFriends(true)}
        onSelectConversation={handleSelectConversation}
        onToggleSelfMute={handleToggleMute}
        onToggleSelfDeafen={handleToggleDeafen}
        onOpenSettings={() => setShowSettings(true)}
        onDragEnd={handleChannelDragEnd}
        voiceGains={voiceGains}
        onSetVoiceGain={handleSetVoiceGain}
        canUseSoundboard={canUseSoundboard}
        onTriggerSoundboardClip={handleTriggerSoundboardClip}
        soundboardPlayingClipId={soundboardPlayingClipId}
        soundboardChips={voiceChannelId ? soundboardChipsByChannel[voiceChannelId] ?? [] : []}
        sharing={sharing}
        onScreenShare={() => (sharing ? handleStopShare() : void handleStartShare())}
        videoEnabled={videoEnabled}
        onToggleVideo={handleToggleVideo}
      />

      {activeOpenApp && (
        <BotMiniAppFrame
          event={activeOpenApp.event}
          hubUrl={activeOpenApp.hubUrl}
          onClose={() => setActiveOpenApp(null)}
        />
      )}

      {hasNoHubs ? (
        <main className="content" style={{ overflow: "auto" }}>
          <WelcomeScreenContainer
            wsHandlers={stableHandlers}
            onHubAdded={(hub, target) => {
              setHubs(listHubs());
              setActiveHubIdState(hub.hub_id);
              void loadHubData().then(() => {
                if (target) return applyDeepLinkTarget(hub.hub_id, target);
              });
            }}
            initialHubUrl={homeHubUrl}
            onBrowse={() => setShowDiscover(true)}
          />
        </main>
      ) : activeHubId && lobbyHubs.has(activeHubId) && publicKey ? (
        <main className="content" style={{ overflow: "auto" }}>
          <Lobby
            key={activeHubId}
            hubId={activeHubId}
            hubName={hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? ""}
            pubkeyHex={publicKey}
            onPromoted={() => void handleLobbyPromoted(activeHubId)}
          />
        </main>
      ) : activeHubId && pendingApprovalHubs.has(activeHubId) ? (
        <main className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <h2 style={{ margin: 0 }}>Waiting for approval</h2>
          <p className="muted" style={{ margin: 0, textAlign: "center", maxWidth: 320 }}>
            Your membership request is pending. A hub admin will review your request shortly.
          </p>
          <button className="btn-secondary" onClick={() => loadHubData()}>Check again</button>
        </main>
      ) : <>
        {(() => {
          if (!selectedChannel) return null;
          const cards = Array.from(activeBotApps.values()).filter(
            (ev) => ev.channel_id === selectedChannel.id,
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
        {voiceChannelId && (
          <WhisperBar
            participants={(voicePartByChannel[voiceChannelId] ?? []).filter((p) => p.public_key !== publicKey)}
            whisperingTo={whisperingTo}
            whisperingFrom={whisperingFrom}
            nameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
            onStart={handleStartWhisper}
            onStop={handleStopWhisper}
          />
        )}
        <ContentArea
        view={view as "channels" | "dms"}
        activeHubId={activeHubId}
        hubs={hubs}
        channels={channels}
        onBreadcrumbCategoryClick={handleBreadcrumbCategoryClick}
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
        knownDisplayNames={knownDisplayNames}
        myDisplayName={meInfo?.display_name ?? null}
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
        voiceActiveUsers={voiceActiveUsers}
        myAvatar={meInfo?.avatar ?? null}
        inputText={inputText}
        typingByKey={channelTypingByKey}
        dmTypingByKey={convTypingByKey}
        messagesEndRef={messagesEndRef}
        messagesEndChannelRef={messagesEndChannelRef}
        messagesContainerRef={messagesContainerRef}
        messageInputRef={messageInputRef}
        onReconnect={() => {}}
        onToggleReaction={handleToggleReaction}
        onSetReplyTarget={setReplyTarget}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onStartEdit={handleStartEdit}
        onDeleteMessage={handleDeleteMessage}
        onSend={handleSend}
        onSendDm={handleSendDm}
        onSendAllianceMessage={() => void handleSendAllianceMessage()}
        onPingTyping={pingTyping}
        onPingDmTyping={pingDmTyping}
        onSetPendingAttachments={setPendingAttachments}
        onAttachFiles={() => {}}
        onOpenEditDescription={() => {}}
        firstNotifyingMessageId={firstNotifyingMessageId}
        onClearFirstNotify={() => setFirstNotifyingMessageId(null)}
        onScrollToMessage={handleScrollToMessage}
        onSetMemberSidebarHidden={setMemberSidebarHidden}
        onSetSearchOpen={setSearchOpen}
        onSetSearchQuery={setSearchQuery}
        onCloseSearch={() => { setSearchOpen(false); setSearchResults(null); setSearchQuery(""); }}
        onJumpToBottom={() => { setStickToBottom(true); setNewWhileScrolledUp(0); }}
        onMessagesScroll={() => {
          const el = messagesContainerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setStickToBottom(atBottom);
          if (atBottom) setNewWhileScrolledUp(0);
        }}
        onSetUserContextMenu={(menu) => {
          if (!menu) { setUserContextMenu(null); return; }
          setUserContextMenu({
            pubkey: menu.user.public_key,
            displayName: menu.user.display_name,
            position: { x: menu.x, y: menu.y },
          });
        }}
        onSetEditingDraft={setEditingDraft}
        onInputTextChange={(v) => {
          setInputText(v);
          if (activeHubId && selectedChannel) saveDraft(`${activeHubId}/${selectedChannel.id}`, v);
        }}
        onKeyDown={handleKeyDown}
        onOpenImage={() => {}}
        onToast={(msg) => showHubError(msg)}
        onError={(msg) => showHubError(typeof msg === "string" ? msg : String((msg as Record<string, unknown>).message ?? msg))}
        slashCommands={slashCommands}
        activeScreenShares={activeScreenShares}
        screenShareViewerRef={screenShareViewerRef}
        onOpenHubStreams={handleOpenHubStreams}
        assertiveAnnouncement={assertiveAnnouncement}
        onStartConversation={handleStartConversation}
        voicePartByChannel={voicePartByChannel}
        canMoveMembers={canMoveMembers}
        onMoveMember={handleMoveMember}
      /></>}
      </MobileShell>

      {showHubAdmin && activeHubId && (
        <div className="modal-overlay" style={{ display: "flex", alignItems: "stretch", justifyContent: "stretch" }}>
          <HubAdminPage
            tab={hubAdminTab}
            onTab={setHubAdminTab}
            onClose={() => setShowHubAdmin(false)}
            hubName={hubAdminName}
            onHubNameChange={setHubAdminName}
            hubDescription={hubAdminDescription}
            onHubDescriptionChange={setHubAdminDescription}
            hubIcon={hubAdminIcon}
            onHubIconChange={setHubAdminIcon}
            requireApproval={hubAdminRequireApproval}
            onRequireApprovalChange={setHubAdminRequireApproval}
            minSecurityLevel={hubAdminMinLevel}
            onMinSecurityLevelChange={setHubAdminMinLevel}
            maxChannelDepth={maxChannelDepth}
            onMaxChannelDepthChange={setMaxChannelDepth}
            welcomeLabel={hubAdminWelcomeLabel}
            onWelcomeLabelChange={setHubAdminWelcomeLabel}
            welcomeInviteUrl={hubAdminWelcomeInviteUrl}
            onWelcomeInviteUrlChange={setHubAdminWelcomeInviteUrl}
            saveError={hubAdminSaveError}
            onSave={saveHubAdminSettings}
            pendingMembers={hubAdminPending}
            onApproveMember={(pk) => hubFetch(`/hub/pending/${pk}/approve`, { method: "POST" }).catch(() => {})}
            members={hubAdminMembers}
            onKickMember={(pk) => hubFetch(`/moderation/kick`, { method: "POST", body: JSON.stringify({ target_public_key: pk }) }).catch(() => {})}
            onBanMember={(pk) => hubFetch(`/moderation/bans`, { method: "POST", body: JSON.stringify({ target_public_key: pk }) }).catch(() => {})}
            bans={hubAdminBans}
            onUnban={(pk) => hubFetch(`/moderation/bans/${pk}`, { method: "DELETE" }).catch(() => {})}
            invites={hubAdminInvites}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            hubSerial={activeHubId ?? ""}
            myPubkey={publicKey ?? ""}
            isAdmin={isAdmin}
            canManageSoundboard={canManageSoundboard}
            canManageRoles={canManageRoles}
            myMaxPriority={myMaxPriority}
            onMemberRolesChanged={setMemberRoles}
            onCreateInvite={(maxUses, expiresIn, grantRoleId) =>
              hubFetch("/invites", { method: "POST", body: JSON.stringify({ max_uses: maxUses, expires_in_seconds: expiresIn, grant_role_id: grantRoleId }) })
                .then((r) => r.json() as Promise<import("@shared/types").InviteInfo>)
                .then((inv) => addInvite(inv))
                .catch(() => {})
            }
            onRevokeInvite={(code) => {
              hubFetch(`/invites/${code}`, { method: "DELETE" }).catch(() => {});
              removeInvite(code);
            }}
            channels={channels}
          />
        </div>
      )}

      {showAddHub && (
        <AddHubModal
          hubUrl={hubUrl}
          onHubUrlChange={handleHubUrlInput}
          hubPreview={hubPreview}
          inviteCode={inviteCode}
          onInviteCodeChange={setInviteCode}
          loading={addingHub}
          error={addHubError}
          onAdd={handleAddHub}
          onAddWithPasskey={publicKey ? handleAddHubWithPasskey : undefined}
          onClose={() => { setShowAddHub(false); setHubPreview({ state: "idle" }); setAddHubError(null); }}
        />
      )}

      {showQuickInvite && activeHubId && (
        <QuickInviteModal
          activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
          hubSerial={activeHubId}
          myMaxPriority={myMaxPriority}
          onClose={() => setShowQuickInvite(false)}
        />
      )}

      {createChannelCtx && (
        <CreateChannelModal
          initialIsCategory={createChannelCtx.isCategory}
          parentId={createChannelCtx.parentId}
          parentName={createChannelCtx.parentId ? (channels.find((c) => c.id === createChannelCtx.parentId)?.name ?? null) : null}
          loading={createChannelLoading}
          error={createChannelError}
          onSubmit={handleCreateChannel}
          onClose={() => { setCreateChannelCtx(null); setCreateChannelError(null); }}
        />
      )}

      {eventComposerChannelId && (
        <EventComposer
          channelId={eventComposerChannelId}
          onCreated={() => {}}
          onClose={() => setEventComposerChannelId(null)}
        />
      )}

      {pollComposerChannelId && (
        <PollComposer
          channelId={pollComposerChannelId}
          onCreated={() => {}}
          onClose={() => setPollComposerChannelId(null)}
        />
      )}

      {channelSettingsCtx && (
        <ChannelSettingsModal
          channel={channelSettingsCtx}
          saving={channelSettingsSaving}
          deleting={channelSettingsDeleting}
          error={channelSettingsError}
          canManageRoles={canManageRoles}
          isAdmin={isAdmin}
          myMaxPriority={myMaxPriority}
          onSave={handleSaveChannelSettings}
          onDelete={handleDeleteChannel}
          onClose={() => { setChannelSettingsCtx(null); setChannelSettingsError(null); }}
        />
      )}

      {channelCtxMenu && (
        <div
          className="context-menu-overlay"
          onClick={() => setChannelCtxMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setChannelCtxMenu(null); }}
        >
          <div
            className="context-menu"
            style={{ top: channelCtxMenu.y, left: channelCtxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {!channelCtxMenu.channel.is_category && activeHubId && (
              <HoverSubmenu
                trigger={<button className="context-menu-item context-menu-submenu-trigger">{t("hub.notifications")} ▸</button>}
              >
                {(["all", "mentions", "silent"] as NotifyMode[]).map((mode) => {
                  const cur = channelNotifyMode[activeHubId]?.[channelCtxMenu.channel.id] ?? hubNotifyMode[activeHubId] ?? "all";
                  return (
                    <button
                      key={mode}
                      className="context-menu-item context-menu-subitem"
                      onClick={() => {
                        const chId = channelCtxMenu.channel.id;
                        setChannelCtxMenu(null);
                        setChannelNotifyMode((prev) => {
                          const hubMap = { ...(prev[activeHubId] ?? {}) };
                          if (mode === "all") delete hubMap[chId]; else hubMap[chId] = mode;
                          return { ...prev, [activeHubId]: hubMap };
                        });
                      }}
                    >
                      {cur === mode ? "✓ " : "   "}{notifyModeLabels[mode]}
                    </button>
                  );
                })}
              </HoverSubmenu>
            )}
            {!channelCtxMenu.channel.is_category && activeHubId && (
              <button
                className="context-menu-item"
                onClick={async () => {
                  const ch = channelCtxMenu.channel;
                  setChannelCtxMenu(null);
                  const hubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url;
                  if (!hubUrl) return;
                  const link = `wavvon://${hubUrl.replace(/^https?:\/\//, "")}/channel/${ch.id}`;
                  try {
                    await navigator.clipboard.writeText(link);
                    showHubError(t("message.action.link_copied"));
                  } catch (e) {
                    showHubError(String(e));
                  }
                }}
              >
                {t("channel.ctx.copy_link")}
              </button>
            )}
            {!channelCtxMenu.channel.is_category &&
              channelCtxMenu.channel.channel_type !== "forum" &&
              isAdmin && (
              <button
                className="context-menu-item"
                onClick={() => {
                  const ch = channelCtxMenu.channel;
                  setChannelCtxMenu(null);
                  setEventComposerChannelId(ch.id);
                }}
              >
                {t("channel.ctx.create_event")}
              </button>
            )}
            {!channelCtxMenu.channel.is_category &&
              channelCtxMenu.channel.channel_type !== "forum" &&
              canSendMessages && (
              <button
                className="context-menu-item"
                onClick={() => {
                  const ch = channelCtxMenu.channel;
                  setChannelCtxMenu(null);
                  setPollComposerChannelId(ch.id);
                }}
              >
                {t("channel.ctx.create_poll")}
              </button>
            )}
            {!channelCtxMenu.channel.is_category &&
              channelCtxMenu.channel.is_temporary &&
              channelCtxMenu.channel.owner_pubkey === publicKey &&
              !isAdmin && (
              <button
                className="context-menu-item"
                onClick={() => {
                  const ch = channelCtxMenu!.channel;
                  setChannelCtxMenu(null);
                  setRenameRoomCtx(ch);
                  setRenameRoomName(ch.name);
                  setRenameRoomError(null);
                }}
              >
                {t("channel.temp.rename")}
              </button>
            )}
            {!channelCtxMenu.channel.is_category && isAdmin && (
              <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--border)" }} />
            )}
            {isAdmin && channelCtxMenu.channel.is_category && (
              <button className="context-menu-item" onClick={() => { const ch = channelCtxMenu; setChannelCtxMenu(null); setCreateChannelCtx({ parentId: ch.channel.id, isCategory: false }); setCreateChannelError(null); }}>
                {t("channel.ctx.create_in", { name: channelCtxMenu.channel.name })}
              </button>
            )}
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { setChannelCtxMenu(null); setCreateChannelCtx({ parentId: null, isCategory: false }); setCreateChannelError(null); }}>
                {t("channel.create.button")}
              </button>
            )}
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { setChannelCtxMenu(null); setCreateChannelCtx({ parentId: null, isCategory: true }); setCreateChannelError(null); }}>
                {t("channel.ctx.create_category")}
              </button>
            )}
            {isAdmin && <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--border)" }} />}
            {isAdmin && (
              <button className="context-menu-item" onClick={() => { const ch = channelCtxMenu!.channel; setChannelCtxMenu(null); setChannelSettingsCtx(ch); setChannelSettingsError(null); }}>
                {t("channel.ctx.edit_name", { name: channelCtxMenu.channel.name })}
              </button>
            )}
            {isAdmin && (
              <button className="context-menu-item danger" onClick={() => { const ch = channelCtxMenu!.channel; setChannelCtxMenu(null); setChannelSettingsCtx(ch); setChannelSettingsError(null); }}>
                {t("channel.ctx.delete_name", { name: channelCtxMenu.channel.name })}
              </button>
            )}
          </div>
        </div>
      )}

      {renameRoomCtx && (
        <div className="modal-overlay" onClick={() => setRenameRoomCtx(null)}>
          <FocusTrap>
            <div className="modal" style={{ maxWidth: 400 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h3>{t("channel.temp.rename_title")}</h3>
              <input
                type="text"
                value={renameRoomName}
                onChange={(e) => setRenameRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRenameRoom();
                  if (e.key === "Escape") setRenameRoomCtx(null);
                }}
                autoFocus
                style={{ display: "block", width: "100%", marginBottom: "var(--space-3)" }}
              />
              {renameRoomError && <div className="error" style={{ marginBottom: 8 }}>{renameRoomError}</div>}
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setRenameRoomCtx(null)}>{t("modal.cancel")}</button>
                <button onClick={() => void handleRenameRoom()} disabled={renameRoomSaving || !renameRoomName.trim()}>
                  {renameRoomSaving ? "…" : t("modal.save")}
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}

      {showDisplayNamePrompt && (
        <div className="modal-overlay" onClick={() => setShowDisplayNamePrompt(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3>{t("onboarding.display_name.title")}</h3>
            <p className="muted" style={{ marginBottom: 12, fontSize: "var(--text-sm)" }}>
              {t("onboarding.display_name.hint")}
            </p>
            <input
              type="text"
              value={firstRunName}
              onChange={(e) => setFirstRunName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSaveFirstRunName(); if (e.key === "Escape") setShowDisplayNamePrompt(false); }}
              placeholder={t("onboarding.display_name.placeholder")}
              style={{ width: "100%", marginBottom: 12 }}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDisplayNamePrompt(false)}>
                {t("onboarding.display_name.skip")}
              </button>
              <button onClick={() => void handleSaveFirstRunName()} disabled={!firstRunName.trim()}>
                {t("onboarding.display_name.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
