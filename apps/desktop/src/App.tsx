// App.tsx — Root component
//
// React concepts for Blazor devs:
// - useState(initial) returns [value, setter] — private field + setter
// - useEffect(fn, [deps]) runs fn when deps change — like OnParametersSet
// - useRef(initial) persists a value across renders — like a field that doesn't trigger re-render
// - Event handlers use camelCase: onClick, onChange, onSubmit

import type { SettingsTab } from "./components/SettingsPage";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DISCOVERY_URL } from "./constants";
import { invoke } from "@tauri-apps/api/core";
import type {
  Channel,
  Attachment,
  NotifyMode,
  User,
  Hub,
  MeInfo,
  Conversation,
  LobbyStatus,
} from "./types";
import { PendingApplication } from "./components/PendingApplication";
import { AppLaunchCard, DiscoverPage, Lobby, type CreateEventPayload, type HubEvent, type Poll, ClockIcon, HubRefusedPanel, SettingsModal } from "@wavvon/ui";
import { useConfirm, VoiceMoveMenu, VoiceMoveToast, VoiceMovePromptModal, SearchBar, moveChannelOptions } from "@wavvon/ui";
import { useVoiceMoveUx, usePresenceStatus, useHubSetupWizardGate, useSoundboardChips } from "@wavvon/ui";
import { WhisperInbox } from "@wavvon/ui";
import type { GlobalSearchResult } from "@wavvon/ui";
import { useWhisperReply } from "./hooks/useWhisperReply";
import { useCollapsedCategories } from "./hooks/useCollapsedCategories";
import { useBlockIgnore } from "./hooks/useBlockIgnore";
import { useActiveApps } from "./hooks/useActiveApps";
import { useDeepLink } from "./hooks/useDeepLink";
import { useMeProfile } from "./hooks/useMeProfile";
import { useChannelDragEnd } from "./hooks/useChannelDragEnd";
import { useAppKeybinds } from "./hooks/useAppKeybinds";
import { useSuppressNativeContextMenu } from "./hooks/useSuppressNativeContextMenu";
import { useVoice } from "./hooks/useVoice";
import { useSoundboard } from "./hooks/useSoundboard";
import { useVideo } from "./hooks/useVideo";
import { useWhisper } from "./hooks/useWhisper";
import { useAddHubFlow } from "./hooks/useAddHubFlow";
import { useChannelCrud } from "./hooks/useChannelCrud";
import { VideoGrid } from "./components/VideoGrid";
import { type ThemeId, type WavvonSkin, applySkinTokens } from "@wavvon/ui";
import {
  formatPubkey,
  buildChannelTree,
} from "@wavvon/core";
import { classifyHubRefusal, type HubRefusal } from "@wavvon/core";
import { useNotificationPrefs } from "./hooks/useNotificationPrefs";
import { useUnreadCounts, useBatchedAnnouncement } from "@wavvon/ui";
import { unreadPersistence } from "./unreadPersistence";
import { useTypingIndicators } from "./hooks/useTypingIndicators";
import { useHubConnections } from "./hooks/useHubConnections";
import { useHubLifecycle } from "./hooks/useHubLifecycle";
import { useHubAdmin } from "./hooks/useHubAdmin";
import { useFriends } from "./hooks/useFriends";
import { useSettingsProfile } from "./hooks/useSettingsProfile";
import { useDms } from "./hooks/useDms";
import { useChannelMessages } from "./hooks/useChannelMessages";
import { useAlliances } from "./hooks/useAlliances";
import { useWsHandlers } from "./hooks/useWsHandlers";
import { useUpdateBanner } from "./hooks/useUpdateBanner";
import { useFirstNotify } from "./hooks/useFirstNotify";
import { useRemoveHubConfirm } from "./hooks/useRemoveHubConfirm";
import { buildVideoTiles } from "./utils/buildVideoTiles";
import { useSlashCommands } from "./hooks/useSlashCommands";
import { SettingsPageContainer } from "./components/SettingsPageContainer";
import { HubAdminContainer } from "./components/HubAdminContainer";
import { AppModals } from "./components/AppModals";
import { HubTopBar } from "@wavvon/ui";
import { useSyncedHubLayout } from "./hooks/useSyncedHubLayout";
import { useUserMenu } from "./hooks/useUserMenu";
import { ChannelSidebarContainer } from "./components/ChannelSidebarContainer";
import { ContentAreaContainer } from "./components/ContentAreaContainer";
import { fetchWithTimeout } from "./utils/fetchWithTimeout";
import { WelcomeScreen } from "@wavvon/ui";
import { UpdateBanner } from "./components/UpdateBanner";
import { setSwitchGuard } from "./accounts/store";
import { DisplayNamePrompt } from "@wavvon/ui";

function App({ accountId }: { accountId: string | null }) {
  const { t } = useTranslation();
  const { confirm: confirmReinstalled, dialog: reinstalledDialog } = useConfirm();
  const [showQuickInvite, setShowQuickInvite] = useState(false);
  // Bumped by the pending screen's "check again", so the join application
  // panel reads its status again too.
  const [approvalChecks, setApprovalChecks] = useState(0);
  const [pendingSurveyHubId, setPendingSurveyHubId] = useState<string | null>(null);
  // Hubs whose answer to /me was a refusal (banned, invite required, ...),
  // shown as such rather than as an empty hub.
  const [refusedHubs, setRefusedHubs] = useState<Map<string, HubRefusal>>(new Map());
  const unreadCounts = useUnreadCounts(unreadPersistence);
  const {
    unreadByChannel,
    unreadByHub,
    noticeByHub,
    unreadDms,
    setUnreadDms,
    bumpUnread,
    clearUnread,
    clearHubUnread,
  } = unreadCounts;

  const notifyPrefs = useNotificationPrefs();
  const {
    hubNotifyMode,
    channelNotifyMode,
    setHubMode,
    setChannelMode,
  } = notifyPrefs;


  // Own presence — global across hubs, not per-hub. The device is the
  // source of truth: the picker broadcasts to every session and each hub
  // gets it re-applied on (re)connect. Distinct from hub mute (notify modes).
  // Four states + "clear after" TTL, and a custom status line (the 2026-11
  // layout decision brought it back from the 2026-07-12 removal).
  const { myPresence, myPresenceRef, handleSetStatus, handleSetCustomStatus } = usePresenceStatus({
    loadRaw: () => localStorage.getItem("wavvon.presence"),
    persist: (p) => { localStorage.setItem("wavvon.presence", JSON.stringify(p)); },
    broadcast: (s, custom) => {
      invoke("send_all_hubs_ws_raw", {
        payload: JSON.stringify({ type: "set_status", status: s, custom }),
      }).catch(() => { /* no hub connected */ });
    },
    // Optimistic: the hubs' member_status broadcasts will confirm. Invisible
    // shows the user offline (to everyone, incl. their own roster view); the
    // footer picker still reflects "invisible".
    applyToRoster: (s, custom) => {
      setUsers((prev) => prev.map((u) =>
        u.public_key === publicKey
          ? { ...u, online: s !== "invisible", status: s === "online" || s === "invisible" ? null : s, status_custom: s === "invisible" ? null : custom }
          : u,
      ));
    },
  });


  const hubConnections = useHubConnections();
  const {
    setHubConnected,
    scheduleReconnect,
    clearReconnectTimer,
    setReconnecting,
    resetAttempts,
    onHubReconnected,
    onHubRemoved: onHubRemovedReconnect,
    cancelAllReconnectTimers,
  } = hubConnections;

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

  const { collapsedCategories, toggleCategoryCollapsed } = useCollapsedCategories();
  const { blockedUsers, ignoredUsers, toggleBlockUser, toggleIgnoreUser } = useBlockIgnore();

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const hubLifecycle = useHubLifecycle({
    setError,
    clearReconnectTimer,
    resetAttempts,
    setReconnecting,
    scheduleReconnect,
    clearHubUnread,
    onHubRemovedReconnect,
  });
  const {
    hubs, setHubs, hubsRef,
    activeHubId, setActiveHubId, activeHubIdRef,
    setActiveHubTimezone,
    hubScope, setHubScope, lobbyHubIds,
    pingByHub,
    handleSwitchHub,
    handleRemoveHub,
  } = hubLifecycle;

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
    adminFarewellLabel,
    setAdminFarewellLabel,
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
    maxAttachmentBytes,
    setMaxAttachmentBytes,
    hubTimezone,
    setHubTimezone,
    birthdaysEnabled,
    setBirthdaysEnabled,
    nameColorMode,
    setNameColorMode,
    afkChannelId,
    setAfkChannelId,
    afkTimeoutSecs,
    setAfkTimeoutSecs,
    pendingMembers,
    hubListed,
    onHubListedChange,
    isAdmin,
    openHubAdmin,
    openHubAdminInvites,
    handleSaveHubBranding,
    handleApproveMember,
    handleRejectMember,
    loadApplication,
    refreshMembers,
    handleKickMember,
    handleBanMember,
    handleMuteMember,
    handleUnmuteMember,
    adminMutes,
    handleTimeoutMember,
    handleUnban,
    handleCreateInvite,
    handleRevokeInvite,
    loadAdminTabData,
  } = useHubAdmin({
    activeHubId,
    hubs,
    setHubs: (updater) => setHubs(updater),
    setError,
    setToast,
    // The hub only broadcasts MemberOffline on a kick or ban, which would
    // leave the member listed as merely offline.
    onMemberRemoved: (pk) => setUsers((prev) => prev.filter((u) => u.public_key !== pk)),
  });

  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const { announcement: voicePoliteAnnouncement, announce: announceVoice } = useBatchedAnnouncement();

  const publicKeyRef = useRef<string | null>(null);
  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);

  const hasActiveHub = hubs.length > 0 && activeHubId !== null;

  // Keep channels in a ref so the WS event handler can check visibility
  // without capturing stale state. Used as the permission gate: messages for
  // channel_ids absent from this list are silently dropped.
  const channelsRef = useRef<Channel[]>([]);

  const firstNotify = useFirstNotify();
  const { setFirstNotify, clearFirstNotify, clearHubFirstNotify } = firstNotify;

  // Chat state
  const [channels, setChannels] = useState<Channel[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  // First-run hub setup wizard (decisions.md 2026-07-25): shown once per hub
  // when an admin lands on an empty channel list. localStorage is fine here —
  // purely cosmetic, same posture as wavvon.seenWelcome/memberSidebarHidden
  // below, not worth a dedicated per-account local_store file+command. The
  // "isAdmin" gate matches the sidebar's own "create channel" entry;
  // loadHubData sets myRoles then channels in the same call, so there's no
  // stale-isAdmin window here.
  const { showHubSetupWizard, closeHubSetupWizard } = useHubSetupWizardGate({
    storageGet: () => localStorage.getItem("wavvon.hubSetupWizardDone"),
    storageSet: (raw) => { localStorage.setItem("wavvon.hubSetupWizardDone", raw); },
    activeHubId,
    isAdmin,
    channelCount: channels.length,
  });

  // Refs kept in App so useTypingIndicators and useChannelMessages can share them.
  const selectedChannelForTypingRef = useRef<Channel | null>(null);
  const selectedConversationForTypingRef = useRef<Conversation | null>(null);

  const typing = useTypingIndicators(selectedChannelForTypingRef, selectedConversationForTypingRef);
  const {
    setTyping,
    clearTyping,
    setDmTyping,
    clearDmTyping,
    clearAllTyping,
    clearAllDmTyping,
  } = typing;

  // Stable getter refs for useDms — avoids capturing stale closures.
  const inputTextRef = useRef("");
  const pendingAttachmentsRef = useRef<Attachment[]>([]);
  const clearInputRef = useRef<() => void>(() => {});
  const clearPendingAttachmentsRef = useRef<() => void>(() => {});

  // Refs that useChannelMessages needs, declared here so they exist before both
  // useDms and useChannelMessages are called.
  const myDisplayNameRef = useRef<string | null>(null);
  const selectedChannelIdRef = useRef<string | null>(null);

  const dms = useDms({
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
    unreadDms,
    setUnreadDms,
  });
  const {
    view,
    setView,
    setConversations,
    selectedConversationIdRef,
    encryptionWarning,
    loadConversations,
    selectConversation,
    startDmWith,
    onDmEvent,
    onDmMemberChanged,
  } = dms;

  // Ctrl+K quick-switcher palette.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const removeHubConfirm = useRemoveHubConfirm(handleRemoveHub);
  // Per account: App is remounted on a switch, and every account has its own hubs.
  const [hubLayout, setHubLayout] = useSyncedHubLayout(accountId, hubs.map((h) => h.hub_id));
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // Above useChannelMessages: the alliance state it wires to the composer now
  // lives here, the way it always has on web.
  const alliances = useAlliances(setError);

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
    selectedAllianceChannel: alliances.selectedAllianceChannel,
    allianceMessages: alliances.allianceMessages,
    setSelectedAllianceChannel: alliances.setSelectedAllianceChannel,
    setAllianceMessages: alliances.setAllianceMessages,
    clearSelectedAllianceChannel: alliances.clearSelectedAllianceChannel,
    selectSharedAllianceChannel: alliances.selectAllianceChannel,
    sendAllianceMessage: alliances.sendAllianceMessage,
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
  } = alliances;

  const [hubDropdownOpen, setHubDropdownOpen] = useState(false);
  const [showHubStreams, setShowHubStreams] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [eventComposerChannelId, setEventComposerChannelId] = useState<string | null>(null);
  const [pollComposerChannelId, setPollComposerChannelId] = useState<string | null>(null);

  const channelCrud = useChannelCrud({
    hubs,
    activeHubId,
    selectedChannel: channelMessages.selectedChannel,
    selectChannel: channelMessages.selectChannel,
    clearSelectedChannel: channelMessages.clearSelectedChannel,
    closeContextMenu: () => setContextMenu(null),
    setChannels,
    setError,
  });

  const {
    setShowCreateChannel,
    setChannelSettingsModal,
    openEditDescription,
    openCreateChannelUnder,
  } = channelCrud;


  // Hub users
  const [users, setUsers] = useState<User[]>([]);

  const { slashCommands, loadSlashCommands, clearSlashCommands } = useSlashCommands();

  const { activeApps, sendAppJoin, onBotAppLaunch, onBotAppOpen, onBotAppClose } = useActiveApps(activeHubId);

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
    setSwitchGuard(() =>
      voice.voiceChannelId ? t("settings.account.accounts.switch_blocked_voice") : null,
    );
    return () => setSwitchGuard(null);
  }, [voice.voiceChannelId, t]);

  const video = useVideo({
    activeHubId,
    voiceChannelId: voice.voiceChannelId,
    publicKey,
    voiceSpeakingPubkeys: voice.speakingPubkeys,
  });

  const whisper = useWhisper({ activeHubId, voiceChannelId: voice.voiceChannelId });
  const soundboard = useSoundboard(voice.voiceChannelId);
  const { chipsByChannel: soundboardChipsByChannel, receiveSoundboardPlayed } = useSoundboardChips();
  const whisperOptoutRef = useRef(whisper.whisperOptout);
  whisperOptoutRef.current = whisper.whisperOptout;
  const { whisperReplyBind, setWhisperReplyBind } = useWhisperReply(whisper, voice.voiceChannelId, users);
  const [showWhisperPanel, setShowWhisperPanel] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);

  // === Voice move (events.md §7.1/§7.2) ===
  const {
    voiceMoveMenu,
    setVoiceMoveMenu,
    voiceChannelNameHint,
    setVoiceChannelNameHint,
    voiceMovePrompt,
    voiceMoveToast,
    dismissVoiceMoveToast,
    handleRejoinPreviousVoiceChannel,
    handleAcceptVoiceMove,
    handleDeclineVoiceMove,
    onVoiceMovePush,
  } = useVoiceMoveUx({ joinVoice: (id) => void voice.handleVoiceJoin(id), isInVoice: voice.isInOrJoiningVoice });

  // Web's useVoice clears this on voice-leave (extRef.clearVoiceChannelNameHint);
  // desktop's hook has no ext-callback hook, so the call site clears it directly.
  function leaveVoiceChannel() {
    voice.handleVoiceLeave();
    setVoiceChannelNameHint(null);
  }

  const canMoveMembers = isAdmin || myRoles.some((r) => r.permissions?.includes("voice.move_members"));
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

  
  const settingsProfile = useSettingsProfile({
    setError,
    setToast,
  });
  const {
    showSettings,
    setShowSettings,
    setTheme,
    setSkin,
    setRecoveryPhrase,
  } = settingsProfile;

  const [showDiscover, setShowDiscover] = useState(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try {
      return localStorage.getItem("wavvon.seenWelcome") !== "1";
    } catch {
      return true;
    }
  });

  const addHubFlow = useAddHubFlow({
    showWelcome,
    publicKey,
    activeHubId,
    setHubs,
    setActiveHubId,
    setPublicKey,
    setHubScope,
    setPendingSurveyHubId,
    setError,
  });

  const {
    setShowAddHub,
    loading,
    hubUrl,
    setHubUrl,
    setInviteCode,
    hubPreview,
    handleHubUrlChange,
    handleAddHub,
  } = addHubFlow;

  const { routeDeepLinkRef } = useDeepLink({
    hubsRef,
    activeHubId,
    channels,
    channelMessages,
    setView,
    handleSwitchHub,
    setHubUrl,
    setInviteCode,
    setShowAddHub,
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
    whisperOptoutRef,
    setHubConnected,
    setAssertiveAnnouncement,
    setToast,
    setTyping,
    clearTyping,
    setDmTyping,
    clearDmTyping,
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
    voiceVisitIdRef: voice.voiceVisitIdRef,
    onVoiceVisitLost: leaveVoiceChannel,
    announceVoice,
    hubs,
    channelsRef,
    onBotAppLaunch,
    onBotAppOpen,
    onBotAppClose,
    onVoiceMove: onVoiceMovePush,
    onChannelsChanged: () => {
      invoke<Channel[]>("list_channels").then(setChannels).catch(() => {});
    },
    onHubBrandingChanged: () => {
      invoke<{ timezone?: string | null }>("get_hub_branding")
        .then((b) => setActiveHubTimezone(b.timezone ?? null))
        .catch(() => {});
      // The hub's name/icon live in the Rust-side account store, so the
      // sidebar entry only refreshes by re-reading the saved hub list.
      invoke<Hub[]>("list_hubs").then(setHubs).catch(() => {});
    },
    onSoundboardPlayed: receiveSoundboardPlayed,
  });

  // get_me reports a hub's answer as {"status","message"}; anything else is a
  // failure to ask, which must not read as a refusal.
  function refusalFrom(e: unknown): HubRefusal | null {
    try {
      const { status, message } = JSON.parse(String(e)) as { status: number; message: string };
      return classifyHubRefusal(status, message);
    } catch {
      return null;
    }
  }

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
      let refusal: HubRefusal | null = null;
      try {
        me = await invoke<MeInfo>("get_me");
        setMyRoles(me.roles);
        setMyApprovalStatus(me.approval_status);
      } catch (e) {
        setMyRoles([]);
        setMyApprovalStatus("unknown");
        refusal = refusalFrom(e);
      }
      if (activeHub) {
        const hubId = activeHub.hub_id;
        setRefusedHubs((prev) => {
          if (!refusal && !prev.has(hubId)) return prev;
          const next = new Map(prev);
          if (refusal) next.set(hubId, refusal);
          else next.delete(hubId);
          return next;
        });
      }
      if (refusal) {
        setChannels([]);
        setUsers([]);
        setConversations([]);
        return;
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

  const { updateInfo, dismissUpdateInfo } = useUpdateBanner();

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
            appearance.slot === "dark" || appearance.slot === "light"
              ? (appearance.slot as ThemeId)
              : "dark";
          setTheme(valid);
          document.documentElement.dataset.theme = valid;
        }
      } catch {
        try {
          const profile = await invoke<{ theme?: string | null }>("get_profile");
          const t = (profile.theme ?? "dark") as ThemeId;
          const valid = t === "dark" || t === "light" ? t : "dark";
          setTheme(valid);
          document.documentElement.dataset.theme = valid;
        } catch {
          document.documentElement.dataset.theme = "dark";
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
        const { hubs: allHubs, unreachable, reinstalled } = await invoke<{
          hubs: Hub[];
          unreachable: { hub_name: string; hub_url: string; error: string }[];
          reinstalled: { hub_name: string; hub_url: string }[];
        }>("auto_connect_saved");
        // Said once, and joining is the member's explicit act: adopting an
        // unendorsed key is exactly what the Rust side refused to do.
        for (const h of reinstalled) {
          const join = await confirmReinstalled({
            title: t("hub.reinstalled.title", { name: h.hub_name }),
            body: t("hub.reinstalled.body", { url: h.hub_url }),
            confirmLabel: t("hub.reinstalled.join"),
          });
          if (join) {
            setHubUrl(h.hub_url);
            setShowAddHub(true);
            break;
          }
        }
        // A hub that could not be reached is still saved; say so rather than
        // let it vanish, and never fall back to the welcome screen for it.
        if (unreachable.length > 0) {
          for (const h of unreachable) console.warn("Saved hub unreachable at startup:", h.hub_url, h.error);
          setToast(t("app.hub_unreachable_at_start", { hub: unreachable.map((h) => h.hub_name || h.hub_url).join(", ") }));
          setShowWelcome(false);
        }
        if (allHubs.length > 0) {
          setHubs(allHubs);
          const active = allHubs.find((h) => h.is_active) ?? allHubs[0];
          setActiveHubId(active.hub_id);
          setShowWelcome(false);
        }
      } catch (e) {
        console.error("Auto-connect failed:", e);
      }
      // Read after auto-connect, so a channel link that launched the app
      // can be matched against the hubs this account has joined.
      try {
        const link = await invoke<string | null>("get_pending_deep_link");
        if (link) routeDeepLinkRef.current(link, hubsRef.current);
      } catch { /* no launch link */ }
      invoke("publish_dh_key").catch((e) =>
        console.warn("Failed to publish DH key:", e)
      );
    })();
  }, []);

  useEffect(() => {
    if (hubs.length > 0) setShowWelcome(false);
  }, [hubs.length]);

  // Who we are is a per-hub answer, and the first read happens before any hub
  // is connected. A hub that met this identity through its self-signed cert
  // seats the master rather than this device's key (see the Rust
  // HubSession::canonical_pubkey), and every "is this mine" in the UI —
  // message authorship, the other member of a DM, the roster row that is us —
  // compares against this value.
  useEffect(() => {
    if (!activeHubId) return;
    invoke<string>("get_my_public_key")
      .then(setPublicKey)
      .catch(() => {});
  }, [activeHubId]);

  const { showDisplayNamePrompt, setShowDisplayNamePrompt, nameSkipKey, saveDisplayName } = useMeProfile({
    hubs,
    activeHubId,
    users,
    setUsers,
    publicKey,
    setError,
  });

  useSuppressNativeContextMenu();

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
      else clearSlashCommands();
    } else {
      // No active hub — clear approval state so the next switch starts fresh.
      setMyApprovalStatus("unknown");
      clearSlashCommands();
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
      if (t === "dark" || t === "light") {
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

  const handleDragEnd = useChannelDragEnd(channels, channelTree, maxChannelDepth, setChannels, setError);

  async function handleHubSetupWizardComplete(firstChannelId: string | null) {
    if (!activeHubId) return;
    closeHubSetupWizard(activeHubId);
    try {
      const list = await invoke<Channel[]>("list_channels");
      setChannels(list);
      const first = firstChannelId ? list.find((c) => c.id === firstChannelId) : undefined;
      if (first) channelMessages.selectChannel(first);
    } catch { /* cosmetic refresh only */ }
  }

  function openContextMenu(e: React.MouseEvent, channel: Channel) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, channel });
  }

  // Mirrors ContentArea.tsx's createEvent/onCreatePoll wrappers (same
  // create_event_hub / create_poll commands) — App-level composer instances
  // need their own copies since ContentArea's are private to that component.
  function createEventForComposer(payload: CreateEventPayload): Promise<HubEvent> {
    const hubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "";
    return invoke<HubEvent>("create_event_hub", {
      hubUrl,
      title: payload.title,
      description: payload.description ?? "",
      startsAt: payload.starts_at,
      endsAt: payload.ends_at ?? null,
      channelId: payload.channel_id,
      location: payload.location ?? null,
      reminderMinutes: payload.reminder_minutes ?? null,
      slots: payload.slots ?? [],
      hubWide: payload.hub_wide ?? false,
      propagateToChildren: payload.propagate_to_children ?? false,
    });
  }

  async function createPollForComposer(channelId: string, question: string, options: string[]): Promise<Poll> {
    const hubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "";
    const raw = await invoke<{
      id: string; channel_id: string; creator_pubkey: string; question: string;
      options: string; ends_at: number | null; created_at: number;
    }>("create_poll", { hubUrl, channelId, question, options, closesAt: null });
    const rawOptions: Array<{ id: string; text: string }> = JSON.parse(raw.options);
    return {
      id: raw.id,
      channel_id: raw.channel_id,
      question: raw.question,
      options: rawOptions.map((o) => ({ id: o.id, text: o.text, vote_count: 0, voted: false })),
      total_votes: 0,
      created_by: raw.creator_pubkey,
      created_at: raw.created_at,
      ends_at: raw.ends_at,
      is_deleted: false,
    };
  }

  useAppKeybinds({
    hubs,
    activeHubId,
    channels,
    view,
    setView,
    voice,
    channelMessages,
    unreadByChannel,
    contextMenu,
    setContextMenu,
    paletteOpen,
    setPaletteOpen,
    setShowKeyboardShortcuts,
    handleSwitchHub,
    openSettings,
    leaveVoiceChannel,
  });

  const userMenu = useUserMenu({
    users,
    publicKey,
    presence: myPresence,
    onSetStatus: handleSetStatus,
    onSetCustomStatus: handleSetCustomStatus,
    onOpenSettings: (tab) => { if (tab) settingsProfile.setSettingsTab(tab as SettingsTab); void openSettings(); },
    onOpenShortcuts: () => setShowKeyboardShortcuts(true),
  });

  return (
    <div className="app">
      {reinstalledDialog}
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
      <WhisperInbox
        entries={whisper.inboundWhisperLog.map((e) => ({
          ...e,
          name: users.find((u) => u.public_key === e.pubkey)?.display_name || e.pubkey.slice(0, 8),
        }))}
        onDismiss={whisper.dismissInbound}
        onClearAll={whisper.clearInbound}
      />
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      {updateInfo && (
        <UpdateBanner
          version={updateInfo.version}
          notes={updateInfo.notes}
          onDismiss={dismissUpdateInfo}
        />
      )}
      <>
        {showHubAdmin && (
          <SettingsModal onClose={() => setShowHubAdmin(false)}>
          <HubAdminContainer
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
            maxAttachmentBytes={maxAttachmentBytes}
            onMaxAttachmentBytesChange={setMaxAttachmentBytes}
            onMaxChannelDepthChange={setMaxChannelDepth}
            welcomeLabel={adminWelcomeLabel}
            onWelcomeLabelChange={setAdminWelcomeLabel}
            farewellLabel={adminFarewellLabel}
            onFarewellLabelChange={setAdminFarewellLabel}
            welcomeInviteUrl={adminWelcomeInviteUrl}
            onWelcomeInviteUrlChange={setAdminWelcomeInviteUrl}
            timezone={hubTimezone}
            onTimezoneChange={setHubTimezone}
            birthdaysEnabled={birthdaysEnabled}
            onBirthdaysEnabledChange={setBirthdaysEnabled}
            nameColorMode={nameColorMode}
            onNameColorModeChange={setNameColorMode}
            afkChannelId={afkChannelId}
            onAfkChannelIdChange={setAfkChannelId}
            afkTimeoutSecs={afkTimeoutSecs}
            onAfkTimeoutSecsChange={setAfkTimeoutSecs}
            onSave={handleSaveHubBranding}
            hubListed={hubListed}
            onHubListedChange={onHubListedChange}
            pendingMembers={pendingMembers}
            onApproveMember={handleApproveMember}
            loadApplication={loadApplication}
            onRejectMember={handleRejectMember}
            members={adminMembers}
            onKickMember={handleKickMember}
            onBanMember={handleBanMember}
            onMuteMember={handleMuteMember}
            onUnmuteMember={handleUnmuteMember}
            mutes={adminMutes}
            onTimeoutMember={handleTimeoutMember}
            onVoiceMuteMember={voice.handleVoiceMuteMember}
            onVoiceUnmuteMember={voice.handleVoiceUnmuteMember}
            voiceMutedKeys={voice.voiceMutedKeys}
            onMemberRolesChanged={() => refreshMembers()}
            bans={adminBans}
            onUnban={handleUnban}
            invites={adminInvites}
            hubs={hubs}
            activeHubId={activeHubId}
            publicKey={publicKey}
            myRoles={myRoles}
            isAdmin={isAdmin}
            soundboardActions={soundboard.soundboardActions}
            onCreateInvite={handleCreateInvite}
            onRevokeInvite={handleRevokeInvite}
            channels={channels}
          />
          </SettingsModal>
        )}
        {showSettings && (
          <SettingsModal onClose={closeSettings}>
          <SettingsPageContainer
            onClose={closeSettings}
            onHubProfileSaved={(hubId) => {
              // The hub keeps its own copy of the profile, so what it reports
              // about me and about the member list both go stale on save.
              if (hubId !== activeHubId) return;
              void invoke<MeInfo>("get_me").then((me) => setMyRoles(me.roles)).catch(() => {});
              void invoke<User[]>("list_users").then(setUsers).catch(() => {});
            }}
            hubs={hubs}
            activeHubId={activeHubId}
            isAdmin={isAdmin}
            publicKey={publicKey}
            blockedUsers={blockedUsers}
            ignoredUsers={ignoredUsers}
            onUnblock={toggleBlockUser}
            onUnignore={toggleIgnoreUser}
            knownNames={pubkeyToName}
            hideBirthdays={hideBirthdays}
            onToggleHideBirthdays={() => setHideBirthdays((v) => !v)}
            voice={voice}
            channelMessages={channelMessages}
            settingsProfile={settingsProfile}
          />
          </SettingsModal>
        )}
          <div className="main-layout">
            <HubTopBar
              hubs={hubs}
              activeHubId={activeHubId}
              view={view}
              multiHub
              layout={hubLayout}
              onLayoutChange={setHubLayout}
              unreadByHub={unreadByHub}
              noticeByHub={noticeByHub}
              unreadDmCount={view === "dms" ? 0 : Object.keys(unreadDms).length}
              pingByHub={pingByHub}
              hubNotifyMode={hubNotifyMode}
              lobbyHubIds={lobbyHubIds}
              onSwitchToDms={() => { if (!hasActiveHub) return; setView("dms"); loadConversations(); }}
              onBackToChannels={() => setView("channels")}
              onSwitchHub={(hubId) => { handleSwitchHub(hubId); setView("channels"); setShowDiscover(false); }}
              onRemoveHub={(hubId: string) => removeHubConfirm.requestRemoveHub(hubId, hubs)}
              onSetHubNotifyMode={setHubMode}
              onOpenSearch={() => setShowSearchBar(true)}
              onAddHub={() => setShowAddHub(true)}
              onDiscover={DISCOVERY_URL ? () => setShowDiscover((v) => !v) : undefined}
              userMenu={userMenu}
            />
            {showDiscover && DISCOVERY_URL ? (
              <DiscoverPage
                onClose={() => setShowDiscover(false)}
                onJoinHub={handleDiscoverJoin}
                fetchUrl={(url) => fetchWithTimeout(url)}
                directoryUrl={DISCOVERY_URL}
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
                  onBrowse={DISCOVERY_URL ? () => setShowDiscover(true) : undefined}
                  onDismiss={dismissWelcome}
                />
              ) : (
                <div className="empty-state">
                  <p className="muted">{t("app.no_hubs")}</p>
                  <button className="primary" onClick={() => setShowAddHub(true)}>
                    {t("app.add_hub")}
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
                  setToast(t("app.welcome_toast", {
                    hub: hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? t("app.the_hub"),
                  }));
                  const resolvedUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "";
                  invoke<{ id: string } | null>("survey_current", { hubUrl: resolvedUrl })
                    .then((survey) => { if (survey) setPendingSurveyHubId(activeHubId); })
                    .catch(() => {});
                }}
              />
            ) : activeHubId && refusedHubs.has(activeHubId) ? (
              <HubRefusedPanel
                key={activeHubId}
                hubName={hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? ""}
                refusal={refusedHubs.get(activeHubId)!}
                onRedeemInvite={async (code) => {
                  // Authenticating again with the code is the redemption; the
                  // new session replaces the refused one.
                  const hubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url;
                  if (!hubUrl) return;
                  await invoke("add_hub", { hubUrl, inviteCode: code });
                  await loadHubData();
                }}
                onRemoveHub={() => removeHubConfirm.requestRemoveHub(activeHubId, hubs)}
              />
            ) : myApprovalStatus === "pending" ? (
              <div className="empty-state pending-approval">
                <div className="pending-approval-icon"><ClockIcon size={32} /></div>
                <h1>{t("app.approval.title")}</h1>
                <p>
                  {t("app.approval.hub_requires", {
                    hub: hubs.find((h) => h.hub_id === activeHubId)?.hub_name
                      ?? t("app.approval.this_hub"),
                  })}
                </p>
                <p className="muted">{t("app.approval.wait_hint")}</p>
                <PendingApplication
                  hubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? null}
                  refreshToken={approvalChecks}
                />
                <button onClick={() => { setApprovalChecks((n) => n + 1); void loadHubData(); }} className="primary">
                  {t("app.approval.check_again")}
                </button>
                {hubs.length > 1 && (
                  <p className="muted" style={{ marginTop: "var(--space-4)" }}>
                    {t("app.approval.switch_hint")}
                  </p>
                )}
              </div>
            ) : (
              <>
                <ChannelSidebarContainer
                  onRequestRemoveHub={(hubId) => removeHubConfirm.requestRemoveHub(hubId, hubs)}
                  view={view}
                  soundboardChipsByChannel={soundboardChipsByChannel}
                  whisperReplyBind={whisperReplyBind}
                  onSetWhisperReplyBind={setWhisperReplyBind}
                  channels={channels}
                  users={users}
                  publicKey={publicKey}
                  isAdmin={isAdmin}
                  myRoles={myRoles}
                  collapsedCategories={collapsedCategories}
                  onToggleCategoryCollapsed={toggleCategoryCollapsed}
                  voiceChannelNameHint={voiceChannelNameHint}
                  setVoiceChannelNameHint={setVoiceChannelNameHint}
                  setVoiceMoveMenu={setVoiceMoveMenu}
                  hubDropdownOpen={hubDropdownOpen}
                  setHubDropdownOpen={setHubDropdownOpen}
                  hideSilenced={hideSilenced}
                  setHideSilenced={setHideSilenced}
                  silencedChannelIds={silencedChannelIds}
                  userAlliances={userAlliances}
                  allianceChannels={allianceChannels}
                  channelTree={channelTree}
                  effectiveNotifyMode={effectiveNotifyMode}
                  clearHubFirstNotify={clearHubFirstNotify}
                  openHubAdmin={openHubAdmin}
                  openHubAdminInvites={openHubAdminInvites}
                  setShowQuickInvite={setShowQuickInvite}
                  openCreateChannelUnder={openCreateChannelUnder}
                  onChannelContextMenu={openContextMenu}
                  setShowCreateChannel={setShowCreateChannel}
                  setChannelSettingsModal={setChannelSettingsModal}
                  leaveVoiceChannel={leaveVoiceChannel}
                  canMoveMembers={canMoveMembers}
                  openFriends={openFriends}
                  openVoiceSettings={() => { settingsProfile.setSettingsTab("voice"); void openSettings(); }}
                  onDragEnd={handleDragEnd}
                  showWhisperPanel={showWhisperPanel}
                  setShowWhisperPanel={setShowWhisperPanel}
                  voice={voice}
                  video={video}
                  whisper={whisper}
                  soundboard={soundboard}
                  notifyPrefs={notifyPrefs}
                  hubLifecycle={hubLifecycle}
                  channelMessages={channelMessages}
                  unreadCounts={unreadCounts}
                  dms={dms}
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
                    onDismiss={dismissVoiceMoveToast}
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
                    tiles={buildVideoTiles(
                      video.remoteStreams,
                      video.videoPubkeys,
                      users,
                      voice.speakingPubkeys,
                      video.pinnedPubkey,
                    )}
                    selfStream={video.processedStream}
                    selfName={myDisplayName ?? t("voice.pip.you")}
                    onPin={video.setPinnedPubkey}
                    onUnpin={() => video.setPinnedPubkey(null)}
                  />
                )}
                {channelMessages.selectedChannel && (() => {
                  const channelId = channelMessages.selectedChannel.id;
                  const cards = Array.from(activeApps.values()).filter(
                    (e) => e.channel_id === channelId
                  );
                  if (cards.length === 0) return null;
                  return (
                    <div className="app-launch-cards">
                      {cards.map((ev) => (
                        <AppLaunchCard
                          key={ev.app_id}
                          event={ev}
                          onJoin={sendAppJoin}
                        />
                      ))}
                    </div>
                  );
                })()}
                <ContentAreaContainer
                  allianceScrollback={alliances.allianceScrollback}
                  view={view}
                  channels={channels}
                  users={users}
                  publicKey={publicKey}
                  blockedUsers={blockedUsers}
                  ignoredUsers={ignoredUsers}
                  knownDisplayNames={knownDisplayNames}
                  myDisplayName={myDisplayName}
                  isAdmin={isAdmin}
                  myRoles={myRoles}
                  memberSidebarHidden={memberSidebarHidden}
                  setMemberSidebarHidden={setMemberSidebarHidden}
                  hideBirthdays={hideBirthdays}
                  openEditDescription={openEditDescription}
                  setUserContextMenu={setUserContextMenu}
                  slashCommands={slashCommands}
                  openImage={openImage}
                  setToast={setToast}
                  setError={setError}
                  showHubStreams={showHubStreams}
                  setShowHubStreams={setShowHubStreams}
                  canMoveMembers={canMoveMembers}
                  handleMoveMember={handleMoveMember}
                  voice={voice}
                  hubLifecycle={hubLifecycle}
                  hubConnections={hubConnections}
                  typing={typing}
                  channelMessages={channelMessages}
                  dms={dms}
                  firstNotify={firstNotify}
                />
              </>
            )}
          </div>

        {showDisplayNamePrompt && (
          <DisplayNamePrompt
            onSave={saveDisplayName}
            onSkip={() => {
              localStorage.setItem(nameSkipKey, "1");
              setShowDisplayNamePrompt(false);
            }}
          />
        )}

        <AppModals
          removeHubConfirm={removeHubConfirm}
          onOpenHomeHubSettings={() => {
            removeHubConfirm.cancel();
            settingsProfile.setSettingsTab("accounts");
            setShowSettings(true);
          }}
          addHub={addHubFlow}
          channelCrud={channelCrud}
          voice={voice}
          hubs={hubs}
          activeHubId={activeHubId}
          channels={channels}
          users={users}
          publicKey={publicKey}
          isAdmin={isAdmin}
          myRoles={myRoles}
          error={error}
          setToast={setToast}
          setShowDiscover={setShowDiscover}
          pendingSurveyHubId={pendingSurveyHubId}
          setPendingSurveyHubId={setPendingSurveyHubId}
          setMyApprovalStatus={setMyApprovalStatus}
          showQuickInvite={showQuickInvite}
          setShowQuickInvite={setShowQuickInvite}
          showFriends={showFriends}
          setShowFriends={setShowFriends}
          startDmWithAndClose={startDmWithAndClose}
          eventComposerChannelId={eventComposerChannelId}
          setEventComposerChannelId={setEventComposerChannelId}
          pollComposerChannelId={pollComposerChannelId}
          setPollComposerChannelId={setPollComposerChannelId}
          createEventForComposer={createEventForComposer}
          createPollForComposer={createPollForComposer}
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          effectiveNotifyMode={effectiveNotifyMode}
          setChannelMode={setChannelMode}
          showHubSetupWizard={showHubSetupWizard}
          closeHubSetupWizard={closeHubSetupWizard}
          handleHubSetupWizardComplete={handleHubSetupWizardComplete}
          paletteOpen={paletteOpen}
          setPaletteOpen={setPaletteOpen}
          onSelectChannel={channelMessages.selectChannel}
          userContextMenu={userContextMenu}
          setUserContextMenu={setUserContextMenu}
          blockedUsers={blockedUsers}
          ignoredUsers={ignoredUsers}
          refreshMembers={refreshMembers}
          handleUserDm={handleUserDm}
          handleUserAddFriend={handleUserAddFriend}
          toggleBlockUser={toggleBlockUser}
          toggleIgnoreUser={toggleIgnoreUser}
          handleDiscoverJoin={handleDiscoverJoin}
          lightbox={lightbox}
          setLightbox={setLightbox}
          encryptionWarning={encryptionWarning}
          showKeyboardShortcuts={showKeyboardShortcuts}
          setShowKeyboardShortcuts={setShowKeyboardShortcuts}
        />

      </>
    </div>
  );
}

export default App;
