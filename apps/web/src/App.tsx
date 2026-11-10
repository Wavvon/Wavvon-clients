import type { SettingsTab } from "@components/settings/SettingsPage";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm, useUnreadCounts, ClockIcon, HubRefusedPanel, AdmissionChallenge, ApplicationPanel, ApplicationPreview } from "@wavvon/ui";
import { useNotificationPrefs } from "./hooks/useNotificationPrefs";
import { useRemoveHubConfirm } from "./hooks/useRemoveHubConfirm";
import { useTypingIndicators } from "./hooks/useTypingIndicators";

import { useHubConnection } from "./hooks/useHubConnection";
import { useHubAdmin } from "./hooks/useHubAdmin";
import { useAlliances } from "./hooks/useAlliances";
import { useSettingsProfile } from "./hooks/useSettingsProfile";
import { useWhisper } from "./hooks/useWhisper";
import { useScreenShare } from "./hooks/useScreenShare";
import { useDms } from "./hooks/useDms";
import { useVoice } from "./hooks/useVoice";
import type { VoiceExtDeps } from "./hooks/useVoice";
import { useVideo } from "./hooks/useVideo";
import { useWsHandlers } from "./hooks/useWsHandlers";
import { useAddHubFlow } from "./hooks/useAddHubFlow";
import { useChannelCrud } from "./hooks/useChannelCrud";
import { useHubLifecycle } from "./hooks/useHubLifecycle";
import { useChannelMessages } from "./hooks/useChannelMessages";
import { useAppKeybinds } from "./hooks/useAppKeybinds";
import { useIdentityBackup } from "./hooks/useIdentityBackup";
import { useBlockIgnore } from "./hooks/useBlockIgnore";
import { useHubErrorToast } from "./hooks/useHubErrorToast";
import { useMeProfile } from "./hooks/useMeProfile";
import { useHubRestore } from "./hooks/useHubRestore";
import { usePathInviteHandoff } from "./hooks/usePathInviteHandoff";
import { usePermissions } from "./hooks/usePermissions";
import { useWhisperReply } from "./hooks/useWhisperReply";
import { useChannelDragEnd } from "./hooks/useChannelDragEnd";
import { channelPath, classifyHubRefusal } from "@wavvon/core";
import { getScoped, setScoped } from "./utils/accountScope";
import { DISCOVERY_URL, MULTI_HUB } from "./constants";
import type {
  Channel,
  User,
  VoiceParticipant,
  Hub,
  MeInfo,
  Conversation,
} from "@shared/types";
import type { AppLaunchEvent, AppOpenEvent } from "./types";
import { HubTopBar, useHubLayout } from "@wavvon/ui";
import { useUserMenu } from "./hooks/useUserMenu";
import { useSoundboardChips } from "@wavvon/ui";
import { WhisperInbox } from "@wavvon/ui";
import { ContentArea } from "@components/layout/ContentArea";
import { ChannelSidebarContainer } from "@components/layout/ChannelSidebarContainer";
import { AppModals } from "@components/layout/AppModals";
import { saveDefaultProfile } from "./utils/profiles";
import { listRoles, listUserRoles, assignRoleToUser, removeRoleFromUser, createInvite } from "@platform";
import {
  listHubIcons,
  forumListTags, forumCreateTag, forumEditTag, forumDeleteTag,
} from "@platform";
import type { UserContextMenuActions } from "@wavvon/ui";
import { getCurrentSurvey, isLobbyScopeConfined, connectHubWebSocket, fetchAllUsers, setActiveHub } from "@platform";
import { getApplicationForm, getApplicationStatus, submitApplication, activeHubSupports } from "@platform";

// Module-level so the panel's load effect sees one object for the app's life;
// each call goes to whichever hub is active, and the panel is keyed by hub.
const applicationActions = {
  getForm: getApplicationForm,
  getStatus: getApplicationStatus,
  submit: submitApplication,
};
import { fetchAdmissionChallenge, submitAdmissionChallenge } from "@platform";
import { fetchMemberHistory } from "@platform";
import { SurveyModal } from "@components/polls/SurveyModal";
import { HubStreamsPanel, ShareDialog } from "@wavvon/ui";
import { AddHubModal } from "@wavvon/ui";
import { passkeysUsableWith } from "@platform";
import { QuickInviteModal } from "@wavvon/ui";
import { ChannelSettingsModal } from "@wavvon/ui";
import { EditDescriptionModal } from "@wavvon/ui";
import { AppLaunchCard, EventComposer, PollComposer, FocusTrap, GameModal, KeyboardShortcuts, ChannelContextMenu, VoiceMoveMenu, VoiceMoveToast, VoiceMovePromptModal, SearchBar, DiscoverPage, Lobby, HubSetupWizard } from "@wavvon/ui";
import { createEvent, createPoll } from "@platform";
import { moveChannelOptions } from "@wavvon/ui";
import { useVoiceMoveUx, usePresenceStatus, useHubSetupWizardGate } from "@wavvon/ui";
import { HubAdminContainer } from "@components/admin/HubAdminContainer";
import {
  channelPermissionsTabActions, channelBansTabActions, channelTalkPowerTabActions,
} from "./platform/adminActions";
import { WelcomeScreenContainer } from "@components/layout/WelcomeScreen";
import { SettingsPageContainer } from "@components/settings/SettingsPageContainer";
import { UserContextMenu } from "@wavvon/ui";
import { VideoPipWindow } from "@components/voice/VideoPipWindow";
import { FriendsModal } from "@wavvon/ui";
import { listFriends, listPendingFriendRequests, sendFriendRequest, acceptFriendRequest, removeFriend } from "@platform";
import { MobileShell } from "@wavvon/ui";
import { buildChannelTree } from "@wavvon/core";
import type { TreeNode } from "@wavvon/core";
import { listAppCommands, getDmBlocks, fetchVoiceRoster, activeSession, sendAppJoin, listConversations } from "@platform";
import { sendSetStatus } from "@platform";
import {
  listHubs,
  refreshHubInfo,
  takeReinstalledHubs,
  hubFetch,
  HubApiError,
  fetchWithTimeout,
  getLobbyStatus,
  getLobbyWelcome,
  submitLobbyPow,
} from "@platform";
import { getActiveHubId, getSession, redeemInvite } from "@platform";
import {
  getMessages,
  getUnreadCounts,
  subscribeChannel,
} from "@platform";
import {
  publishDhKey,
} from "@platform";
import { loadIdentity, publicKeyHex, setSwitchGuard } from "@identity/index";
import { IdentitySetupScreen, type IdentitySetupCompletion } from "@components/identity/IdentitySetupScreen";
import type { HubInputResult } from "@wavvon/core";

// ---- Types ----
type View = "channels" | "dms";

// ---- App ----

export interface AppProps {
  // Set by AccountRoot right after an in-place account switch initiated from
  // Settings → Account, so the user lands back there on the new account
  // instead of the main view.
  initialView?: "settings-account";
}

export default function App({ initialView }: AppProps = {}) {
  const { t } = useTranslation();
  const { confirm: confirmReinstalled, dialog: reinstalledDialog } = useConfirm();
  const { hubErrorToast, showHubError } = useHubErrorToast();

  // A saved hub that came back under a key its old one never endorsed was
  // reinstalled: the platform layer forgot it without signing in. Say so once,
  // and let the member decide whether to join the new hub at that address.
  async function offerReinstalledHubs() {
    const found = takeReinstalledHubs();
    if (found.length === 0) return;
    setHubs(listHubs());
    setActiveHubIdState(getActiveHubId());
    for (const hub of found) {
      const join = await confirmReinstalled({
        title: t("hub.reinstalled.title", { name: hub.hub_name }),
        body: t("hub.reinstalled.body", { url: hub.hub_url }),
        confirmLabel: t("hub.reinstalled.join"),
      });
      if (join) {
        setHubUrl(hub.hub_url);
        setShowAddHub(true);
        return;
      }
    }
  }
  // === Identity ===
  const [ready, setReady] = useState<"checking" | "setup" | "ok">("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // Captured wholesale (not just destructured) so it can be passed straight
  // through to SettingsPageContainer/ChannelSidebarContainer as one grouped
  // prop (state-access-design.md Phase 1) — App still pulls out the handful
  // of fields it needs directly (useAppKeybinds, the mention-ping ref).
  const settingsProfile = useSettingsProfile(setPublicKey, initialView);
  const { showSettings, setShowSettings, mentionPingEnabled } = settingsProfile;
  const { backupNeeded, showBackupPrompt, setShowBackupPrompt, handleOwnMessageSent } = useIdentityBackup(publicKey, showSettings);

  // === Hubs ===
  const hubLifecycle = useHubLifecycle({ loadHubData, resetChannelSelectionState, goToChannelsView });
  const {
    hubs, setHubs,
    activeHubId, setActiveHubIdState,
    activeHubTimezone, setActiveHubTimezone,
    pingByHub,
    lobbyHubs, setLobbyHubs,
    pendingApprovalHubs, setPendingApprovalHubs,
    refusedHubs, setRefusedHubs,
    handleSwitchHub,
    handleRemoveHub,
  } = hubLifecycle;
  // Removing a hub is local and reversible, but a removed *home* hub keeps
  // receiving this user's DMs — so the sidebar asks first rather than acting
  // (decisions.md, "Leave hub does not leave").
  const removeHubConfirm = useRemoveHubConfirm(handleRemoveHub);
  const [hubLayout, setHubLayout] = useHubLayout(
    () => getScoped("wavvon.hubLayout"),
    useCallback((raw: string) => setScoped("wavvon.hubLayout", raw), []),
    hubs.map((h) => h.hub_id),
  );
  const hubConnection = useHubConnection();
  const { hubConnected, reconnectingHubs, handleStatusChange } = hubConnection;
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const [voicePoliteAnnouncement, setVoicePoliteAnnouncement] = useState("");
  const voiceAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVoiceAnnouncementsRef = useRef<string[]>([]);
  const [showQuickInvite, setShowQuickInvite] = useState(false);
  const [homeHubUrl, setHomeHubUrl] = useState<string | undefined>(undefined);
  const [channelCtxMenu, setChannelCtxMenu] = useState<{ channel: Channel; x: number; y: number } | null>(null);
  // "Create event"/"create poll" from the channel context menu (create-anything
  // task): both composers are self-contained modals that only need a target
  // channel id, so they can be opened without switching to that channel first.
  const [eventComposerChannelId, setEventComposerChannelId] = useState<string | null>(null);
  const [pollComposerChannelId, setPollComposerChannelId] = useState<string | null>(null);

  // === Hub data ===
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meInfo, setMeInfo] = useState<MeInfo | null>(null);
  const [slashCommands, setSlashCommands] = useState<Array<{ command: string; description: string; app_name: string }>>([]);
  const alliances = useAlliances(showHubError);
  const {
    userAlliances, setUserAlliances, allianceChannels, setAllianceChannels,
    selectedAllianceChannel, allianceMessages, loadAlliances,
    selectAllianceChannel, clearSelectedAllianceChannel, sendAllianceMessage,
  } = alliances;

  // === View ===
  const [view, setView] = useState<View>("channels");

  // === Unread / notifications ===
  const unreadCounts = useUnreadCounts();
  const {
    unreadByChannel, unreadByHub, noticeByHub, unreadDms, setUnreadDms,
    bumpUnread, clearUnread, seedUnreadFromServer,
  } = unreadCounts;

  // === Messages ===
  // App-side navigation when a channel/alliance channel is selected — one of
  // the two directions between this hook and useDms has to be a callback
  // defined here, since each needs the other's setter.
  function clearConversationSelection() { setSelectedConversation(null); }
  const channelMessages = useChannelMessages({
    activeHubId,
    setView,
    clearConversationSelection,
    clearUnread,
    selectedAllianceChannel,
    clearSelectedAllianceChannel,
    selectAllianceChannel,
    sendAllianceMessage,
    onMessageSent: handleOwnMessageSent,
    onError: showHubError,
  });
  const {
    selectedChannel, setSelectedChannel, selectedChannelRef, selectedChannelIdRef,
    messages, setMessages,
    inputText, setInputText,
    editingMessageId, setEditingMessageId,
    editingDraft, setEditingDraft,
    replyTarget, setReplyTarget,
    pendingAttachments, setPendingAttachments,
    stickToBottom, setStickToBottom,
    newWhileScrolledUp, setNewWhileScrolledUp,
    searchOpen, setSearchOpen,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    firstNotifyingMessageId, setFirstNotifyingMessageId,
    pendingScrollMessageId, setPendingScrollMessageId,
    messagesEndRef, messagesEndChannelRef, messagesContainerRef, messageInputRef,
    handleScrollToMessage,
    handleSelectChannel,
    handleSelectAllianceChannel,
    handleSendAllianceMessage,
    handleSend,
    handleSaveEdit,
    handleCancelEdit,
    handleStartEdit,
    handleDeleteMessage,
    handleToggleReaction,
    handleKeyDown,
    handleJumpToBottom,
    handleMessagesScroll,
    handleInputTextChange,
    handleCloseSearch,
  } = channelMessages;
  // On a phone the member list is a sheet over the chat: start it closed.
  const [memberSidebarHidden, setMemberSidebarHidden] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches === true,
  );

  // Reset shared by useHubLifecycle's handleSwitchHub (clearMessages=true) and
  // handleRemoveHub (clearMessages=false). Defined as a function declaration
  // (hoisted) so useHubLifecycle can be called before useChannelMessages,
  // useDms, and useAlliances exist — its body only runs later, once all three
  // are initialized.
  function resetChannelSelectionState(clearMessages: boolean) {
    setSelectedChannel(null);
    clearConversationSelection();
    clearSelectedAllianceChannel();
    setUserAlliances([]);
    setAllianceChannels({});
    if (clearMessages) setMessages([]);
  }
  function goToChannelsView() { setView("channels"); }

  // === DMs ===
  const dms = useDms({
    inputText,
    setInputText,
    pendingAttachments,
    setPendingAttachments,
    setUnreadDms,
    onConversationSelected: () => { setSelectedChannel(null); setView("dms"); },
    showHubError,
  });
  const {
    conversations, setConversations, dmMessages,
    selectedConversation, setSelectedConversation, selectedConvRef,
    handleSelectConversation, handleStartConversation, handleSendDm,
    onDm, onDmMemberChanged,
  } = dms;
  const notifyPrefs = useNotificationPrefs();
  const {
    hubNotifyMode, channelNotifyMode, pinnedChannels, collapsedCategories, hideSilenced,
    hideBirthdays, toggleHideBirthdays,
    setHubNotifyMode, setChannelNotifyMode, setCollapsedCategories, toggleHideSilenced, effectiveNotifyMode,
  } = notifyPrefs;
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
  const { blockedUsers, setBlockedUsers, ignoredUsers, toggleBlockUser, toggleIgnoreUser } = useBlockIgnore(showHubError);
  // === Hub admin ===
  const hubAdminState = useHubAdmin({
    activeHubId,
    // The sidebar renders the locally-stored hub list, whose hub_name/hub_icon
    // are written at add-time — sync them or a rename/icon change never shows
    // up there.
    onSaved: () => {
      if (!activeHubId) return;
      refreshHubInfo(activeHubId).then((info) => {
        if (info) setHubs(listHubs());
      }).catch(() => {});
    },
    onMemberRemoved: dropMember,
  });
  const {
    showHubAdmin, setShowHubAdmin,
    hubAdminTab, setHubAdminTab,
    maxChannelDepth,
    openHubAdmin,
  } = hubAdminState;

  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // === New web-only UI state ===
  const [showDiscover, setShowDiscover] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  // Full-screen image overlay, opened by clicking an image attachment. The
  // attachment renders inside a button either way, so without this the button
  // was there and did nothing.
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [userContextMenu, setUserContextMenu] = useState<{
    user: User;
    position: { x: number; y: number };
  } | null>(null);

  // === Refs mirrored for WS handlers / voice (created early so the voice
  // cluster below, and useWsHandlers further down, can read them) ===
  const publicKeyRef = useRef<string | null>(publicKey);
  publicKeyRef.current = publicKey;
  const meInfoRef = useRef<MeInfo | null>(null);
  useEffect(() => { meInfoRef.current = meInfo; }, [meInfo]);
  const mentionPingEnabledRef = useRef(mentionPingEnabled);
  mentionPingEnabledRef.current = mentionPingEnabled;
  const effectiveNotifyModeRef = useRef(effectiveNotifyMode);
  effectiveNotifyModeRef.current = effectiveNotifyMode;

  // === Presence (own status, shared across every hub this account is on) ===
  const presence = usePresenceStatus({
    loadRaw: () => getScoped("wavvon.presence"),
    persist: (p) => { try { setScoped("wavvon.presence", JSON.stringify(p)); } catch { /* storage unavailable */ } },
    broadcast: (s, custom) => { try { sendSetStatus(s, custom); } catch { /* ws not ready */ } },
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
  const { myPresence, myPresenceRef, handleSetStatus } = presence;
  const userMenu = useUserMenu({
    users,
    publicKey,
    presence,
    onOpenSettings: (tab) => { if (tab) settingsProfile.setSettingsTab(tab as SettingsTab); setShowSettings(true); },
    onOpenShortcuts: () => setShowKeyboardShortcuts(true),
    settingsNeedsAttention: backupNeeded,
  });

  // === Voice / video / whisper / voice-move UX ===
  // The hubFetch("/channels") -> setChannels resync used when a spawner join
  // lands in a sibling room not yet in the local channel list.
  function refetchChannels() {
    hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
  }
  // Filled in below once useVideo/useWhisper/useVoiceMoveUx exist. useVoice
  // only ever reads extRef.current at call time (async), so it's safe for
  // this to start out as no-ops and be overwritten later in the same render.
  const voiceExtRef = useRef<VoiceExtDeps>({
    createVideoSession: () => {},
    disposeVideo: () => {},
    stopVideoSessionOnly: () => {},
    stopWhisperIfActive: () => {},
    setVoiceChannelNameHint: () => {},
    clearVoiceChannelNameHint: () => {},
  });
  const voice = useVoice({
    publicKey, publicKeyRef, meInfoRef, showHubError, refetchChannels, extRef: voiceExtRef,
  });
  const video = useVideo({ voiceChannelId: voice.voiceChannelId, showHubError, publicKeyRef });
  const voiceMoveUx = useVoiceMoveUx({ joinVoice: voice.handleVoiceJoin, isInVoice: voice.isInOrJoiningVoice });
  const whisper = useWhisper({ activeHubId, voiceChannelId: voice.voiceChannelId });
  voiceExtRef.current = {
    createVideoSession: video.createVideoSession,
    disposeVideo: video.disposeVideo,
    stopVideoSessionOnly: video.stopVideoSessionOnly,
    stopWhisperIfActive: () => { if (whisper.isWhispering) whisper.stopWhisper(); },
    setVoiceChannelNameHint: (name) => voiceMoveUx.setVoiceChannelNameHint(name),
    clearVoiceChannelNameHint: () => voiceMoveUx.setVoiceChannelNameHint(null),
  };
  const whisperOptoutRef = useRef(whisper.whisperOptout);
  whisperOptoutRef.current = whisper.whisperOptout;
  const { whisperReplyBind, setWhisperReplyBind } = useWhisperReply(whisper, voice.voiceChannelId, users);
  const [surveyToShow, setSurveyToShow] = useState<import("@platform").SurveyAdmin | null>(null);
  const surveyDismissedRef = useRef<Set<string>>(new Set());
  // Registered so switchAccount can refuse a mid-voice switch at the source
  // (defense in depth alongside the disabled Switch button in Settings →
  // Account) — switching accounts while joined to a voice channel is blocked
  // outright, not auto-left on the caller's behalf.
  useEffect(() => {
    setSwitchGuard(() => (voice.voiceChannelId ? t("settings.account.accounts.switch_blocked_voice") : null));
    return () => setSwitchGuard(null);
  }, [voice.voiceChannelId, t]);

  const [activeApps, setActiveApps] = useState<Map<string, AppLaunchEvent>>(new Map());
  const [activeOpenApp, setActiveOpenApp] = useState<{ event: AppOpenEvent; hubUrl: string } | null>(null);

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
    if (result.profile) saveDefaultProfile({ display_name: result.profile.display_name, avatar: result.profile.avatar, bio: null, pronouns: null, status_message: null, activities: null, accent_color: null, name_color: null, cover: null, favorite_hubs: [], show_hubs: false, birthday: null });
    loadIdentity().then((rec) => {
      if (rec) setPublicKey(rec.canonical_pubkey ?? publicKeyHex(rec.seed_hex));
      setReady("ok");
    });
  }

  // === Typing ===
  const selectedConvIdRef = useRef<string | undefined>(undefined);
  const typingIndicators = useTypingIndicators(
    () => selectedChannelIdRef.current,
    () => selectedConvIdRef.current,
    () => publicKeyRef.current,
  );
  const { receiveTyping, pingTyping, pingDmTyping } = typingIndicators;
  const { chipsByChannel: soundboardChipsByChannel, receiveSoundboardPlayed } = useSoundboardChips();

  // === Refs ===
  const [showFriends, setShowFriends] = useState(false);

  // === WS handlers (stable via ref) ===

  const activeHubIdRef = useRef<string | null>(null);
  useEffect(() => { activeHubIdRef.current = activeHubId; }, [activeHubId]);

  // Outbound screen share + cross-channel hub-streams discovery.
  const screenShare = useScreenShare({ activeHubIdRef, showHubError });
  const {
    screenShareViewerRef, activeScreenShares,
    hubStreams, showHubStreams, setShowHubStreams, openedIds,
    handleStartShare, handleOpenHubStreams, handleWatchStream,
    handleStopWatchStream, onScreenShare, onScreenShareChunk, resubscribeStreams,
  } = screenShare;

  const hubsRef = useRef<Hub[]>([]);
  const channelsRef = useRef<Channel[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  useEffect(() => { hubsRef.current = hubs; }, [hubs]);

  useEffect(() => {
    selectedConvIdRef.current = selectedConversation?.id;
  }, [selectedConversation]);

  // A kicked or banned member's row goes at once: the hub only broadcasts
  // MemberOffline, which would leave them listed as merely offline.
  function dropMember(pubkey: string) {
    setUsers((prev) => prev.filter((u) => u.public_key !== pubkey));
    fetchAllUsers().then(setUsers).catch(() => {});
  }

  const { showDisplayNamePrompt, setShowDisplayNamePrompt, handleSaveFirstRunName, handleHubProfileSaved } = useMeProfile({
    meInfo, setMeInfo, setUsers, activeHubId, showHubError,
  });

  const loadHubDataRef = useRef<() => Promise<void>>(async () => {});
  loadHubDataRef.current = loadHubData;

  const { stableHandlers, stableHandlersRef } = useWsHandlers({
    activeHubIdRef, hubsRef, selectedChannelRef, meInfoRef, publicKeyRef,
    myPresenceRef, effectiveNotifyModeRef, mentionPingEnabledRef, whisperOptoutRef,
    setMessages, setStickToBottom, setNewWhileScrolledUp, bumpUnread,
    setUsers, setChannels, setHubs, setActiveHubTimezone,
    setVoicePartByChannel: voice.setVoicePartByChannel,
    onDm, onDmMemberChanged, receiveTyping,
    onScreenShare, onScreenShareChunk, resubscribeStreams, receiveSoundboardPlayed,
    handleStatusChange, setAssertiveAnnouncement, showHubError,
    loadHubDataRef,
    voiceOnVoiceState: voice.onVoiceState,
    voiceOnVoiceZoneState: voice.onVoiceZoneState,
    voiceOnVoiceZoneCreated: voice.onVoiceZoneCreated,
    voiceOnVoiceZoneDestroyed: voice.onVoiceZoneDestroyed,
    voiceOnVoicePositionUpdated: voice.onVoicePositionUpdated,
    voiceOnVoiceKeyReceived: voice.onVoiceKeyReceived,
    voiceOnVoiceKeyRequest: voice.onVoiceKeyRequest,
    handleVideoMessage: video.handleVideoMessage,
    receiveWhisperEvent: whisper.receiveWhisperEvent,
    onVoiceMovePush: voiceMoveUx.onVoiceMovePush,
    setActiveApps, setActiveOpenApp,
  });

  const hubsRestored = useHubRestore({
    ready, stableHandlers, setHubs, setActiveHubIdState, loadHubData, offerReinstalledHubs, setHomeHubUrl,
  });

  // === Hub data loading ===

  async function loadHubData() {
    if (loadingHub.current) return;
    loadingHub.current = true;
    // Self-heal the locally-cached hub name+icon (stored at add-time): a
    // rename or icon change done in hub admin — possibly on another device —
    // otherwise never reaches the sidebar, not even across reloads.
    // Fire-and-forget.
    {
      const hubId = getActiveHubId();
      if (hubId) {
        refreshHubInfo(hubId).then((info) => {
          if (info) {
            setHubs(listHubs());
            setActiveHubTimezone(info.timezone);
          } else {
            void offerReinstalledHubs();
          }
        }).catch(() => { /* cosmetic sync only */ });
      }
    }
    try {
      const sessionRefusal = getActiveHubId() ? getSession(getActiveHubId()!)?.refusal : undefined;
      if (sessionRefusal) {
        setRefusedHubs((prev) => new Map(prev).set(getActiveHubId()!, sessionRefusal));
        setChannels([]);
        setUsers([]);
        setConversations([]);
        setSelectedChannel(null);
        return;
      }
      const [ch, usr, me, convs, cmds, voiceRoster, dmBlocks] = await Promise.allSettled([
        hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>),
        fetchAllUsers(),
        hubFetch("/me").then((r) => r.json() as Promise<MeInfo>),
        listConversations(),
        listAppCommands().catch(() => [] as Array<{ command: string; description: string; app_name: string }>),
        fetchVoiceRoster().catch(() => ({} as Record<string, VoiceParticipant[]>)),
        getDmBlocks().catch(() => null),
      ]);
      // A lobby-scoped session (lobby-survey.md Feature 1) 403s every
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
      // /me is the one route a pending-approval session may still reach, so a
      // 403 there (or on /channels, /users) that is not pending/lobby is the
      // hub refusing the session outright.
      const refusal = [me, ch, usr]
        .map((r) => (r.status === "rejected" && r.reason instanceof HubApiError ? classifyHubRefusal(r.reason.status, r.reason.message) : null))
        .find((x) => x !== null) ?? null;
      if (hubIdForLobbyCheck) {
        setRefusedHubs((prev) => {
          if (!refusal && !prev.has(hubIdForLobbyCheck)) return prev;
          const next = new Map(prev);
          if (refusal) next.set(hubIdForLobbyCheck, refusal);
          else next.delete(hubIdForLobbyCheck);
          return next;
        });
      }
      if (refusal) {
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
        // Self-identify as this hub knows us: the seat differs between hubs
        // (device key on a pre-certificate hub, master on a newer one), so an
        // account-wide key would find nobody in this hub's member list.
        if (meVal.public_key) setPublicKey(meVal.public_key);
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
      if (voiceRoster.status === "fulfilled") voice.setVoicePartByChannel(voiceRoster.value);
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

  // Lobby -> member transition in place (lobby-survey.md Feature 1):
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
    const hubName = hubsRef.current.find((h) => h.hub_id === hubId)?.hub_name ?? t("app.the_hub");
    showHubError(t("lobby.welcome", { hub: hubName }));
  }

  // === Hub management ===
  // handleSwitchHub/handleRemoveHub now live in
  // useHubLifecycle; applyDeepLinkTarget stays here since it also drives
  // handleSelectChannel/setPendingScrollMessageId (from useChannelMessages).

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

  // addHub only points the session's active hub at the new one when there was
  // none, so for a second hub the React state said "new hub" while every
  // hubFetch kept answering from the old one (the new header over the old
  // hub's channels and messages). The selection reset is the same as a switch:
  // loadHubData only auto-selects a channel when nothing is selected.
  function activateJoinedHub(hubId: string) {
    setActiveHub(hubId);
    setActiveHubIdState(hubId);
    resetChannelSelectionState(true);
    goToChannelsView();
  }

  const {
    hubUrl, setHubUrl,
    inviteCode, setInviteCode,
    hubPreview, setHubPreview,
    addingHub,
    addHubError, setAddHubError,
    showAddHub, setShowAddHub,
    admissionChallenge, setAdmissionChallenge,
    applicationPreview, setApplicationPreview,
    handleHubUrlInput,
    handlePreviewHub,
    handleAddHub,
    handleAddHubWithPasskey,
  } = useAddHubFlow({
    publicKey, stableHandlers, hubsRef, setHubs, activateJoinedHub, loadHubData,
    applyDeepLinkTarget, t,
  });

  usePathInviteHandoff({
    publicKey, hubsRestored, handleHubUrlInput, setShowAddHub, loadHubData, showHubError, setHomeHubUrl,
  });

  // === Channel / messages ===
  // handleSelectChannel/handleSelectAllianceChannel/handleSendAllianceMessage
  // and the composer/edit/reaction handlers below now live in
  // useChannelMessages.

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

  // Mover's side: right-click "Move to channel…" (events.md §7.1) and the
  // event staging panel (§7.5, eventId set) both funnel through here.
  function handleMoveMember(targetPubkey: string, targetChannelId: string, eventId?: string) {
    const ws = activeSession().ws;
    if (!ws) { showHubError("Not connected"); return; }
    ws.sendVoiceMove(targetPubkey, targetChannelId, eventId);
  }

  const {
    isAdmin, can, canManageRoles, canEditChannelPermissions, canMoveMembers, canCreateInvites,
    canSendMessages, canUseSoundboard, canScreenShare, canUseCamera, canManageSoundboard,
    canManageHubAlliances, myRoles, myMaxPriority,
  } = usePermissions(meInfo, voice.myVoicePerms, voice.voiceChannelId);

  // First-run hub setup wizard (decisions.md 2026-07-25): shown once per hub
  // when an admin lands on an empty channel list. "Done" covers both
  // "picked a template" and "started blank" — never re-nag either way.
  const { showHubSetupWizard, setShowHubSetupWizard, closeHubSetupWizard } = useHubSetupWizardGate({
    storageGet: () => getScoped("wavvon.hubSetupWizardDone"),
    storageSet: (raw) => { try { setScoped("wavvon.hubSetupWizardDone", raw); } catch { /* storage unavailable */ } },
    activeHubId,
    isAdmin,
    channelCount: channels.length,
  });

  const channelCrud = useChannelCrud({
    setChannels, selectedChannel, setSelectedChannel, showHubError, handleSelectChannel,
    activeHubId, closeHubSetupWizard,
  });
  const {
    bannerEditChannel, setBannerEditChannel,
    handleSaveBannerUrl,
    createChannelCtx, setCreateChannelCtx,
    createChannelLoading,
    createChannelError, setCreateChannelError,
    channelSettingsCtx, setChannelSettingsCtx,
    channelSettingsSaving,
    channelSettingsDeleting,
    channelSettingsError, setChannelSettingsError,
    editDescChannel, setEditDescChannel,
    editDescValue, setEditDescValue,
    renameRoomCtx, setRenameRoomCtx,
    renameRoomName, setRenameRoomName,
    renameRoomSaving,
    renameRoomError, setRenameRoomError,
    handleCreateChannel,
    createChannelForWizard,
    handleSaveChannelSettings,
    handleDeleteChannel,
    handleSaveDescription,
    handleRenameRoom,
    handleHubSetupWizardComplete,
  } = channelCrud;

  const voiceMoveChannelOptions = useMemo(
    () => moveChannelOptions(channels).filter((c) => c.id !== voiceMoveUx.voiceMoveMenu?.currentChannelId),
    [channels, voiceMoveUx.voiceMoveMenu],
  );

  const userContextMenuActions: UserContextMenuActions = {
    listRoles,
    listUserRoles,
    assignRole: assignRoleToUser,
    removeRole: removeRoleFromUser,
    muteUser: (pubkey) => hubFetch("/moderation/mutes", { method: "POST", body: JSON.stringify({ target_public_key: pubkey }) }).then(() => {}),
    kickUser: (pubkey) => hubFetch("/moderation/kick", { method: "POST", body: JSON.stringify({ target_public_key: pubkey }) }).then(() => dropMember(pubkey)),
    banUser: (pubkey) => hubFetch("/moderation/bans", { method: "POST", body: JSON.stringify({ target_public_key: pubkey }) }).then(() => dropMember(pubkey)),
    dm: (user) => handleStartConversation(user.public_key),
    addFriend: (user) => {
      void sendFriendRequest(user.public_key)
        .then(() => showHubError(`Friend request sent to ${user.display_name ?? user.public_key.slice(0, 8)}`))
        .catch((e) => showHubError(`Failed to send friend request: ${e}`));
    },
    toggleBlock: toggleBlockUser,
    toggleIgnore: toggleIgnoreUser,
    fetchMemberHistory,
  };

  const knownDisplayNames = useMemo(
    () => new Set(users.map((u) => u.display_name).filter(Boolean) as string[]),
    [users],
  );

  const channelTree = useMemo<TreeNode[]>(
    () => buildChannelTree(channels),
    [channels],
  );
  const handleChannelDragEnd = useChannelDragEnd(channels, channelTree, maxChannelDepth, setChannels);

  useAppKeybinds({
    hubs, channels, selectedChannel, messageInputRef, unreadByChannel, activeHubIdRef,
    switchHub: handleSwitchHub, handleSelectChannel,
    showKeyboardShortcuts, setShowKeyboardShortcuts,
    showSettings, setShowSettings,
    showHubAdmin, setShowHubAdmin,
    showAddHub, setShowAddHub,
    showQuickInvite, setShowQuickInvite,
    showSearchBar, setShowSearchBar,
    searchOpen, setSearchOpen,
  });

  // === Render ===

  if (ready === "checking") {
    return <div style={{ padding: 32 }}>{t("app.loading")}</div>;
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


  return (
    <div className="main-layout">
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

      {hubErrorToast && (
        <div
          style={{
            position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)",
            background: "var(--surface)", border: "1px solid var(--danger)",
            borderRadius: "var(--r-md)", padding: "8px 16px", zIndex: 9999,
            fontSize: "var(--text-sm)", color: "var(--danger)",
          }}
        >
          {hubErrorToast}
        </div>
      )}

      {voiceMoveUx.voiceMoveToast && (
        <VoiceMoveToast
          channelName={voiceMoveUx.voiceMoveToast.channelName}
          canRejoin={voiceMoveUx.voiceMoveToast.sourceChannelId !== null}
          onRejoin={voiceMoveUx.handleRejoinPreviousVoiceChannel}
          onDismiss={voiceMoveUx.dismissVoiceMoveToast}
        />
      )}

      {voiceMoveUx.voiceMovePrompt && (
        <VoiceMovePromptModal
          channelName={voiceMoveUx.voiceMovePrompt.targetChannelName}
          onAccept={voiceMoveUx.handleAcceptVoiceMove}
          onDecline={voiceMoveUx.handleDeclineVoiceMove}
        />
      )}

      {voiceMoveUx.voiceMoveMenu && (
        <VoiceMoveMenu
          displayName={voiceMoveUx.voiceMoveMenu.displayName}
          position={voiceMoveUx.voiceMoveMenu.position}
          channels={voiceMoveChannelOptions}
          onMove={(channelId) => { handleMoveMember(voiceMoveUx.voiceMoveMenu!.pubkey, channelId); voiceMoveUx.setVoiceMoveMenu(null); }}
          onClose={() => voiceMoveUx.setVoiceMoveMenu(null)}
        />
      )}

      {showKeyboardShortcuts && (
        <KeyboardShortcuts onClose={() => setShowKeyboardShortcuts(false)} />
      )}

      {showDiscover && DISCOVERY_URL && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--bg)", overflow: "auto" }}>
          <DiscoverPage
            onClose={() => setShowDiscover(false)}
            onJoinHub={(hubUrl, inviteCode) => {
              setHubUrl(hubUrl);
              setInviteCode(inviteCode);
              setShowDiscover(false);
              setShowAddHub(true);
            }}
            fetchUrl={fetchWithTimeout}
            directoryUrl={DISCOVERY_URL}
          />
        </div>
      )}

      {showSearchBar && (
        <SearchBar
          onSearch={(q) => hubFetch(`/search?q=${encodeURIComponent(q)}`).then((r) => r.json())}
          onClose={() => setShowSearchBar(false)}
          onNavigate={(channelId, _messageId) => {
            const ch = channels.find((c) => c.id === channelId);
            if (ch) void handleSelectChannel(ch);
            setShowSearchBar(false);
          }}
        />
      )}

      {showFriends && (
        <FriendsModal
          actions={{ listFriends, listPendingFriendRequests, sendFriendRequest, acceptFriendRequest, removeFriend }}
          onClose={() => setShowFriends(false)}
          onToast={(msg) => showHubError(msg)}
        />
      )}

      {screenShare.shareDialogFor && (
        <ShareDialog
          loadLimits={screenShare.loadStreamLimits}
          onStart={(q) => void screenShare.handleShareChosen(q)}
          onCancel={() => screenShare.setShareDialogFor(null)}
        />
      )}

      {showHubStreams && (
        <HubStreamsPanel
          streams={hubStreams}
          subscribedIds={openedIds}
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

      <SettingsPageContainer
        settingsProfile={settingsProfile}
        notifyPrefs={notifyPrefs}
        hubs={hubs}
        publicKey={publicKey}
        blockedUsers={blockedUsers}
        ignoredUsers={ignoredUsers}
        knownNames={pubkeyToName}
        inVoice={voice.voiceChannelId !== null}
        onHubProfileSaved={handleHubProfileSaved}
        onUnblock={toggleBlockUser}
        onUnignore={toggleIgnoreUser}
      />

      {userContextMenu && (
        <UserContextMenu
          user={userContextMenu.user}
          publicKey={publicKey}
          isAdmin={isAdmin}
          canManageRoles={canManageRoles}
          myMaxPriority={myMaxPriority}
          blockedUsers={blockedUsers}
          ignoredUsers={ignoredUsers}
          position={userContextMenu.position}
          actions={userContextMenuActions}
          onClose={() => setUserContextMenu(null)}
          onToast={(msg) => showHubError(msg)}
          onRolesChanged={() => {
            fetchAllUsers().then(setUsers).catch(() => {});
          }}
        />
      )}

      {voice.voiceChannelId && (video.videoEnabled || video.remoteVideoStreams.size > 0) && (
        <VideoPipWindow
          title={`#${channels.find((c) => c.id === voice.voiceChannelId)?.name ?? "voice"}`}
          localStream={video.localVideoStream}
          remoteStreams={video.remoteVideoStreams}
          nameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
        />
      )}

      <MobileShell
        showHubSidebar
        showChannelSidebar
        showContent
        onBack={() => {}}
        // No hub yet: the join screen is in the content panel. The hub build
        // has a single hub, so start on its channels rather than on a list
        // of one.
        initialPanel={!activeHubId ? "content" : MULTI_HUB ? "hub" : "channel"}
        hubKey={activeHubId}
        contentKey={sidebarView === "dms" ? selectedConversation?.id ?? null : selectedChannel?.id ?? null}
      >
      <HubTopBar
        hubs={hubs}
        activeHubId={activeHubId}
        view={sidebarView as "channels" | "dms"}
        multiHub={MULTI_HUB}
        layout={hubLayout}
        onLayoutChange={setHubLayout}
        unreadByHub={unreadByHub}
        noticeByHub={noticeByHub}
        unreadDmCount={view === "dms" ? 0 : Object.keys(unreadDms).length}
        pingByHub={pingByHub}
        hubNotifyMode={hubNotifyMode}
        lobbyHubIds={lobbyHubs}
        onSwitchToDms={() => { if (activeHubId) setView("dms"); }}
        onBackToChannels={goToChannelsView}
        onSwitchHub={handleSwitchHub}
        onRemoveHub={(hubId: string) => removeHubConfirm.requestRemoveHub(hubId, hubs)}
        onSetHubNotifyMode={(hubId, mode) =>
          setHubNotifyMode((prev) => { const n = { ...prev }; if (mode === "all") delete n[hubId]; else n[hubId] = mode; return n; })
        }
        onOpenSearch={() => setShowSearchBar(true)}
        onAddHub={MULTI_HUB ? () => setShowAddHub(true) : undefined}
        onDiscover={DISCOVERY_URL ? () => setShowDiscover(true) : undefined}
        userMenu={userMenu}
      />

      <ChannelSidebarContainer
        voice={voice}
        video={video}
        whisper={whisper}
        voiceMoveUx={voiceMoveUx}
        notifyPrefs={notifyPrefs}
        hubLifecycle={hubLifecycle}
        onRequestRemoveHub={(hubId: string) => removeHubConfirm.requestRemoveHub(hubId, hubs)}
        unreadCounts={unreadCounts}
        dms={dms}
        alliances={alliances}
        screenShare={screenShare}
        channelCrud={channelCrud}
        channelMessages={channelMessages}
        hubAdmin={hubAdminState}
        view={sidebarView as "channels" | "dms"}
        channels={channels}
        channelTree={channelTree}
        users={users}
        publicKey={publicKey}
        isAdmin={isAdmin}
        canCreateInvites={canCreateInvites}
        canEditChannelPermissions={canEditChannelPermissions}
        canManageRoles={canManageRoles}
        canMoveMembers={canMoveMembers}
        canUseSoundboard={canUseSoundboard}
        canScreenShare={canScreenShare}
        canUseCamera={canUseCamera}
        silencedChannelIds={silencedChannelIds}
        soundboardChipsByChannel={soundboardChipsByChannel}
        whisperReplyBind={whisperReplyBind}
        onSetWhisperReplyBind={setWhisperReplyBind}
        onOpenQuickInvite={() => setShowQuickInvite(true)}
        onChannelContextMenu={(e, channel) => { e.preventDefault(); setChannelCtxMenu({ channel, x: e.clientX, y: e.clientY }); }}
        onOpenFriends={() => setShowFriends(true)}
        onOpenVoiceSettings={() => { settingsProfile.setSettingsTab("voice"); setShowSettings(true); }}
        onDragEnd={handleChannelDragEnd}
      />

      {activeOpenApp && (
        <GameModal
          miniAppUrl={activeOpenApp.event.mini_app_url}
          sessionToken={activeOpenApp.event.session_token}
          channelId={activeOpenApp.event.channel_id}
          appId={activeOpenApp.event.app_id}
          hubUrl={activeOpenApp.hubUrl}
          title={activeApps.get(activeOpenApp.event.app_id)?.title ?? t("app.default_title")}
          requiresCamera={activeOpenApp.event.requires_camera}
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
              // Same post-join publish as the Add-hub modal paths — without
              // it a first-run user has no DH key on their first hub until
              // the next reload, so DMs to them fall back to plaintext and
              // their encrypted sends can't be decrypted by the peer.
              publishDhKey().catch(() => {});
              void loadHubData().then(() => {
                if (target) return applyDeepLinkTarget(hub.hub_id, target);
              });
            }}
            initialHubUrl={homeHubUrl}
            onBrowse={DISCOVERY_URL ? () => setShowDiscover(true) : undefined}
          />
        </main>
      ) : activeHubId && refusedHubs.has(activeHubId) ? (
        <main className="content" style={{ overflow: "auto" }}>
          <HubRefusedPanel
            key={activeHubId}
            hubName={hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? ""}
            refusal={refusedHubs.get(activeHubId)!}
            onRedeemInvite={getSession(activeHubId)?.refusal ? null : async (code) => {
              await redeemInvite(code);
              await loadHubData();
            }}
            onRemoveHub={() => removeHubConfirm.requestRemoveHub(activeHubId, hubs)}
          />
        </main>
      ) : activeHubId && lobbyHubs.has(activeHubId) && publicKey ? (
        <main className="content" style={{ overflow: "auto" }}>
          <Lobby
            key={activeHubId}
            hubId={activeHubId}
            hubName={hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? ""}
            pubkeyHex={publicKey}
            actions={{
              getStatus: getLobbyStatus,
              getWelcome: getLobbyWelcome,
              submitProof: submitLobbyPow,
            }}
            onPromoted={() => void handleLobbyPromoted(activeHubId)}
          />
        </main>
      ) : activeHubId && pendingApprovalHubs.has(activeHubId) ? (
        <main className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <div className="pending-approval-icon"><ClockIcon size={32} /></div>
          <h2 style={{ margin: 0 }}>{t("app.approval.title")}</h2>
          <p className="muted" style={{ margin: 0, textAlign: "center", maxWidth: 320 }}>
            {t("app.approval.body")}
          </p>
          {activeHubSupports("admission.application") && (
            <ApplicationPanel key={activeHubId} actions={applicationActions} refreshToken={meInfo} />
          )}
          <button className="btn-secondary" onClick={() => loadHubData()}>{t("app.approval.check_again")}</button>
        </main>
      ) : <>
        {(() => {
          if (!selectedChannel) return null;
          const cards = Array.from(activeApps.values()).filter(
            (ev) => ev.channel_id === selectedChannel.id,
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
        <ContentArea
          channelMessages={channelMessages}
          dms={dms}
          alliances={alliances}
          hubLifecycle={hubLifecycle}
          hubConnection={hubConnection}
          voice={voice}
          screenShare={screenShare}
          notifyPrefs={notifyPrefs}
          channelCrud={channelCrud}
          typing={typingIndicators}
          view={view as "channels" | "dms"}
          channels={channels}
          onBreadcrumbCategoryClick={handleBreadcrumbCategoryClick}
          onOpenImage={(src, alt) => setLightbox({ src, alt })}
          users={users}
          publicKey={publicKey}
          blockedUsers={blockedUsers}
          ignoredUsers={ignoredUsers}
          knownDisplayNames={knownDisplayNames}
          myDisplayName={meInfo?.display_name ?? null}
          isAdmin={isAdmin}
          myRoles={myRoles}
          memberSidebarHidden={memberSidebarHidden}
          onSetMemberSidebarHidden={setMemberSidebarHidden}
          selfInvisible={myPresence.status === "invisible"}
          onSetUserContextMenu={(menu) => {
            if (!menu) { setUserContextMenu(null); return; }
            setUserContextMenu({ user: menu.user, position: { x: menu.x, y: menu.y } });
          }}
          onToast={showHubError}
          slashCommands={slashCommands}
          canMoveMembers={canMoveMembers}
          onMoveMember={handleMoveMember}
        /></>}
      </MobileShell>

      <AppModals
        lightbox={lightbox}
        onCloseLightbox={() => setLightbox(null)}
        removeHub={removeHubConfirm}
        encryptionWarning={dms.encryptionWarning}
        onOpenHomeHubSettings={() => {
          removeHubConfirm.cancel();
          settingsProfile.setSettingsTab("accounts");
          setShowSettings(true);
        }}
        showBackupPrompt={showBackupPrompt}
        onBackupPromptShowPhrase={() => {
          setShowBackupPrompt(false);
          settingsProfile.setSettingsTab("accounts");
          setShowSettings(true);
        }}
        onBackupPromptLater={() => setShowBackupPrompt(false)}
        activeHubId={activeHubId}
        addHubError={addHubError}
        addingHub={addingHub}
        canEditChannelPermissions={canEditChannelPermissions}
        canManageRoles={canManageRoles}
        canDo={can}
        canManageSoundboard={canManageSoundboard}
        canManageHubAlliances={canManageHubAlliances}
        canSendMessages={canSendMessages}
        channelBansTabActions={channelBansTabActions}
        channelCtxMenu={channelCtxMenu}
        channelPermissionsTabActions={channelPermissionsTabActions}
        channelSettingsCtx={channelSettingsCtx}
        channelSettingsDeleting={channelSettingsDeleting}
        channelSettingsError={channelSettingsError}
        channelSettingsSaving={channelSettingsSaving}
        channelTalkPowerTabActions={channelTalkPowerTabActions}
        channels={channels}
        closeHubSetupWizard={closeHubSetupWizard}
        bannerEditChannel={bannerEditChannel}
        setBannerEditChannel={setBannerEditChannel}
        handleSaveBannerUrl={handleSaveBannerUrl}
        createChannelCtx={createChannelCtx}
        createChannelError={createChannelError}
        createChannelForWizard={createChannelForWizard}
        createChannelLoading={createChannelLoading}
        editDescChannel={editDescChannel}
        editDescValue={editDescValue}
        effectiveNotifyMode={effectiveNotifyMode}
        eventComposerChannelId={eventComposerChannelId}
        handleAddHub={handleAddHub}
        handleAddHubWithPasskey={handleAddHubWithPasskey}
        handleCreateChannel={handleCreateChannel}
        handleDeleteChannel={handleDeleteChannel}
        handleHubSetupWizardComplete={handleHubSetupWizardComplete}
        handleHubUrlInput={handleHubUrlInput}
        handleRenameRoom={handleRenameRoom}
        handleSaveChannelSettings={handleSaveChannelSettings}
        handleSaveDescription={handleSaveDescription}
        handleSaveFirstRunName={handleSaveFirstRunName}
        hubAdminState={hubAdminState}
        hubPreview={hubPreview}
        hubUrl={hubUrl}
        hubs={hubs}
        inviteCode={inviteCode}
        isAdmin={isAdmin}
        myMaxPriority={myMaxPriority}
        pollComposerChannelId={pollComposerChannelId}
        publicKey={publicKey}
        renameRoomCtx={renameRoomCtx}
        renameRoomError={renameRoomError}
        renameRoomName={renameRoomName}
        renameRoomSaving={renameRoomSaving}
        setAddHubError={setAddHubError}
        setChannelCtxMenu={setChannelCtxMenu}
        setChannelNotifyMode={setChannelNotifyMode}
        setChannelSettingsCtx={setChannelSettingsCtx}
        setChannelSettingsError={setChannelSettingsError}
        setCreateChannelCtx={setCreateChannelCtx}
        setCreateChannelError={setCreateChannelError}
        setEditDescChannel={setEditDescChannel}
        setEditDescValue={setEditDescValue}
        setEventComposerChannelId={setEventComposerChannelId}
        setHubPreview={setHubPreview}
        setInviteCode={setInviteCode}
        setPollComposerChannelId={setPollComposerChannelId}
        setRenameRoomCtx={setRenameRoomCtx}
        setRenameRoomError={setRenameRoomError}
        setRenameRoomName={setRenameRoomName}
        setShowAddHub={setShowAddHub}
        setShowDiscover={setShowDiscover}
        setShowDisplayNamePrompt={setShowDisplayNamePrompt}
        setShowHubAdmin={setShowHubAdmin}
        setShowQuickInvite={setShowQuickInvite}
        showAddHub={showAddHub}
        showDisplayNamePrompt={showDisplayNamePrompt}
        showHubAdmin={showHubAdmin}
        showHubError={showHubError}
        showHubSetupWizard={showHubSetupWizard}
        showQuickInvite={showQuickInvite}
        users={users}
      />
      {/* After AppModals, so it stacks above the Add hub modal it came from. */}
      {admissionChallenge && (
        <AdmissionChallenge
          fetchPrompt={() => fetchAdmissionChallenge(admissionChallenge.hubUrl, admissionChallenge.pubkey)}
          submit={(id, answer) => submitAdmissionChallenge(admissionChallenge.hubUrl, id, admissionChallenge.pubkey, answer)}
          onPassed={(token) => {
            setAdmissionChallenge(null);
            void handleAddHub(token);
          }}
          onCancel={() => setAdmissionChallenge(null)}
        />
      )}
      {applicationPreview && (
        <ApplicationPreview
          hubName={applicationPreview.hubName}
          form={applicationPreview.form}
          onJoin={() => {
            setApplicationPreview(null);
            void handleAddHub(undefined, true);
          }}
          onCancel={() => setApplicationPreview(null)}
        />
      )}
    </div>
  );
}
