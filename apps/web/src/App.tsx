import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useUnreadCounts } from "./hooks/useUnreadCounts";
import { useNotificationPrefs } from "./hooks/useNotificationPrefs";
import { useTypingIndicators } from "./hooks/useTypingIndicators";
import { useSoundboardChips } from "./hooks/useSoundboardChips";
import { useHubConnection } from "./hooks/useHubConnection";
import { useHubAdmin } from "./hooks/useHubAdmin";
import { useSettingsProfile } from "./hooks/useSettingsProfile";
import { useFarmAdmin } from "./hooks/useFarmAdmin";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { flattenTree, descendantIds, computeDepth, mentionsName, playMentionPing, channelPath } from "@wavvon/core";
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
import type { ActiveStream, BotAppLaunchEvent, BotAppOpenEvent } from "./types";
import { BotAppLaunchCard } from "@components/BotAppLaunchCard";
import { BotMiniAppFrame } from "@components/BotMiniAppFrame";
import { HubSidebar } from "@components/HubSidebar";
import { ChannelSidebar } from "@components/ChannelSidebar";
import { ContentArea } from "@components/ContentArea";
import { WhisperBar } from "@components/WhisperBar";
import { AddHubModal } from "@components/AddHubModal";
import { CreateChannelModal } from "@components/CreateChannelModal";
import { ChannelSettingsModal } from "@components/ChannelSettingsModal";
import { FarmSettingsPage } from "@components/FarmSettingsPage";
import { CreateHubWizard } from "@components/CreateHubWizard";
import { KeyboardShortcuts } from "@wavvon/ui";
import { HubAdminPage } from "./components/HubAdminPage";
import { SearchBar } from "@components/SearchBar";
import { WelcomeScreenContainer } from "@components/WelcomeScreen";
import { SettingsPage } from "@components/SettingsPage";
import { UserContextMenu } from "@components/UserContextMenu";
import { FriendsModal } from "@components/FriendsModal";
import { MobileShell } from "@components/MobileShell";
import { DiscoverPage } from "@components/DiscoverPage";
import { buildChannelTree } from "@wavvon/core";
import type { TreeNode } from "@wavvon/core";
import { saveDraft, loadDraft, clearDraft } from "./utils/drafts";
import type { ScreenShareViewerRef } from "@components/ScreenShareViewer";
import { listBotCommands, updateDmBlocks, fetchVoiceRoster, activeSession, authenticateWithPasskey } from "@platform";
import { markSoundboardPlayed, fetchSoundboardAudioBytes } from "@platform";
import {
  restorePersistedHubs,
  addHub,
  removeHub,
  setActiveHub,
  listHubs,
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
} from "@platform";
import {
  loadIdentity,
  generateIdentity,
  publicKeyHex,
  seedToPhrase,
  phraseToSeed,
  validatePhrase,
  saveIdentity,
} from "@identity/index";

// ---- Types ----
type View = "channels" | "dms";
type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number }
  | { state: "error"; message: string };

// ---- Identity Setup ----

function IdentitySetupScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<"choose" | "generated" | "recover">("choose");
  const [generatedPhrase, setGeneratedPhrase] = useState("");
  const [generatedSeed, setGeneratedSeed] = useState("");
  const [showHexBackup, setShowHexBackup] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [hexInput, setHexInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function doGenerate() {
    const rec = await generateIdentity();
    setGeneratedSeed(rec.seed_hex);
    setGeneratedPhrase(seedToPhrase(rec.seed_hex));
    setStep("generated");
  }

  async function doRecoverPhrase() {
    setError(null);
    if (!validatePhrase(phrase)) { setError("Invalid recovery phrase."); return; }
    try {
      const hex = phraseToSeed(phrase);
      await saveIdentity({ id: "main", seed_hex: hex, security_nonce: 0, security_level: 0 });
      onComplete();
    } catch (e) { setError(String(e)); }
  }

  async function doRecoverHex() {
    setError(null);
    if (!/^[0-9a-fA-F]{64}$/.test(hexInput)) { setError("Must be 64 hex chars."); return; }
    try {
      await saveIdentity({ id: "main", seed_hex: hexInput.toLowerCase(), security_nonce: 0, security_level: 0 });
      onComplete();
    } catch (e) { setError(String(e)); }
  }

  if (step === "generated") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
        <h2>Save your recovery phrase</h2>
        <p className="muted">Write these 24 words down and store them somewhere safe. Anyone with this phrase can control your identity.</p>
        <div style={{ background: "var(--bg-elevated)", padding: 16, borderRadius: "var(--r-md)", fontFamily: "monospace", lineHeight: 1.8, marginBottom: 16 }}>{generatedPhrase}</div>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          <button
            className="btn-ghost"
            style={{ fontSize: "inherit", padding: 0, textDecoration: "underline" }}
            onClick={() => setShowHexBackup((v) => !v)}
          >
            {showHexBackup ? "Hide" : "Show"} seed hex (alternative backup)
          </button>
          {showHexBackup && <code style={{ display: "block", marginTop: 4, wordBreak: "break-all" }}>{generatedSeed}</code>}
        </p>
        <button className="btn-primary" onClick={onComplete} style={{ marginTop: 16 }}>
          I saved my phrase — Continue
        </button>
      </div>
    );
  }

  if (step === "recover") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
        <h2>Recover identity</h2>
        <label className="settings-label">24-word recovery phrase</label>
        <textarea rows={3} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="word1 word2 word3 …" style={{ width: "100%", marginBottom: 8 }} />
        <button onClick={doRecoverPhrase} style={{ marginBottom: 16 }}>Recover from phrase</button>
        <label className="settings-label">Or seed hex (64 chars)</label>
        <input type="text" value={hexInput} onChange={(e) => setHexInput(e.target.value)} placeholder="a1b2c3d4…" style={{ width: "100%", fontFamily: "monospace", marginBottom: 8 }} />
        <button onClick={doRecoverHex} style={{ marginBottom: 8 }}>Recover from hex</button>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <br />
        <button className="btn-ghost" onClick={() => { setStep("choose"); setError(null); }}>Back</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "120px auto", padding: 32, textAlign: "center" }}>
      <h1>Wavvon</h1>
      <p className="muted">Create a new identity or recover an existing one.</p>
      <button className="btn-primary" style={{ width: "100%", marginBottom: 12 }} onClick={doGenerate}>
        Create new identity
      </button>
      <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setStep("recover")}>
        Recover existing identity
      </button>
    </div>
  );
}

// ---- App ----

export default function App() {
  const { t } = useTranslation();
  // === Identity ===
  const [ready, setReady] = useState<"checking" | "setup" | "ok">("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const {
    showSettings, setShowSettings,
    settingsTab, setSettingsTab,
    theme,
    skin,
    recoveryPhrase, setRecoveryPhrase,
    copiedKey,
    mentionPingEnabled, setMentionPingEnabled,
    handleSetTheme,
    handleSkinChange,
    handleShowRecovery,
    handleRecoverIdentity,
    handleCopyKey: handleCopyKeyFn,
  } = useSettingsProfile(setPublicKey);

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
  const [homeHubUrl, setHomeHubUrl] = useState<string | undefined>(undefined);
  const [createChannelCtx, setCreateChannelCtx] = useState<{ parentId: string | null; isCategory: boolean } | null>(null);
  const [createChannelLoading, setCreateChannelLoading] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [channelCtxMenu, setChannelCtxMenu] = useState<{ channel: Channel; x: number; y: number } | null>(null);
  const [channelSettingsCtx, setChannelSettingsCtx] = useState<Channel | null>(null);
  const [channelSettingsSaving, setChannelSettingsSaving] = useState(false);
  const [channelSettingsDeleting, setChannelSettingsDeleting] = useState(false);
  const [channelSettingsError, setChannelSettingsError] = useState<string | null>(null);

  // === Hub data ===
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meInfo, setMeInfo] = useState<MeInfo | null>(null);
  const [voicePartByChannel, setVoicePartByChannel] = useState<Record<string, VoiceParticipant[]>>({});
  const [voiceActiveUsers, setVoiceActiveUsers] = useState<Set<string>>(new Set());
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [selfMuted, setSelfMuted] = useState(false);
  const [selfDeafened, setSelfDeafened] = useState(false);
  const voiceSessionRef = useRef<VoiceWsSession | null>(null);
  const [voiceGains, setVoiceGains] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("wavvon.voice_gains") || "{}") as Record<string, number>; }
    catch { return {}; }
  });
  const [slashCommands, setSlashCommands] = useState<Array<{ command: string; description: string; bot_name: string }>>([]);
  const [userAlliances, setUserAlliances] = useState<AllianceInfo[]>([]);
  const [allianceChannels, setAllianceChannels] = useState<Record<string, AllianceSharedChannel[]>>({});
  const [pendingApprovalHubs, setPendingApprovalHubs] = useState<Set<string>>(new Set());

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
  const [allianceMessages] = useState<Message[]>([]);

  // === DMs ===
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [dmMessages, setDmMessages] = useState<Record<string, DmMessage[]>>({});

  // === Unread / notifications ===
  const {
    unreadByChannel, unreadDms, setUnreadDms,
    bumpUnread, clearUnread, clearHubUnread: clearHubUnreadFn, seedUnreadFromServer,
  } = useUnreadCounts();
  const {
    hubNotifyMode, channelNotifyMode, pinnedChannels, collapsedCategories,
    setHubNotifyMode, setCollapsedCategories, effectiveNotifyMode,
  } = useNotificationPrefs();
  const pubkeyToName = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const u of users) m[u.public_key] = u.display_name ?? null;
    return m;
  }, [users]);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [ignoredUsers, setIgnoredUsers] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("wavvon.ignoredUsers");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });

  function toggleBlockUser(pubkey: string) {
    setBlockedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      updateDmBlocks(Array.from(next)).catch(() => {});
      return next;
    });
  }

  function toggleIgnoreUser(pubkey: string) {
    setIgnoredUsers((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      try { localStorage.setItem("wavvon.ignoredUsers", JSON.stringify(Array.from(next))); } catch {}
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
    hubAdminMembers,
    hubAdminBans,
    hubAdminInvites,
    hubAdminPending,
    maxChannelDepth, setMaxChannelDepth,
    openHubAdmin,
    saveHubAdminSettings,
    addInvite,
    removeInvite,
  } = useHubAdmin({ activeHubId });

  // === Profiles ===
  const namedProfiles: import("@shared/types").NamedProfile[] = [];
  const defaultProfileId: string | null = null;

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

  // === Typing ===
  const selectedChannelIdRef = useRef<string | undefined>(undefined);
  const selectedConvIdRef = useRef<string | undefined>(undefined);
  const publicKeyRef = useRef<string | null>(publicKey);
  publicKeyRef.current = publicKey;
  const mentionPingEnabledRef = useRef(mentionPingEnabled);
  mentionPingEnabledRef.current = mentionPingEnabled;
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
  const [showFriends, setShowFriends] = useState(false);
  // Camera video (full-mesh WebRTC over the main WS).
  const videoSessionRef = useRef<WebVideoSession | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Map<string, MediaStream>>(new Map());
  // Whisper: set of pubkeys currently whispering to me + whether I'm whispering.
  const [whisperingFrom, setWhisperingFrom] = useState<Set<string>>(new Set());
  const [whisperingTo, setWhisperingTo] = useState<string[]>([]);

  const [activeBotApps, setActiveBotApps] = useState<Map<string, BotAppLaunchEvent>>(new Map());
  const [activeOpenApp, setActiveOpenApp] = useState<{ event: BotAppOpenEvent; hubUrl: string } | null>(null);

  const loadingHub = useRef(false);


  // === Identity init ===

  useEffect(() => {
    loadIdentity().then((rec) => {
      if (rec) {
        setPublicKey(publicKeyHex(rec.seed_hex));
        setReady("ok");
      } else {
        setReady("setup");
      }
    });
  }, []);

  function handleIdentityComplete() {
    loadIdentity().then((rec) => {
      if (rec) setPublicKey(publicKeyHex(rec.seed_hex));
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

  useEffect(() => {
    if (hubs.length === 1 && meInfo !== null && !meInfo.display_name) {
      setShowDisplayNamePrompt(true);
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
        if (isMention && msg.sender !== myPk) {
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
        const ev = m as unknown as ActiveStream & { _hub_id: string };
        setActiveScreenShares((prev) => {
          if (prev.some((s) => s.stream_id === ev.stream_id)) return prev;
          return [...prev, { stream_id: ev.stream_id, sharer_pubkey: ev.sharer_pubkey, kind: ev.kind, mime: ev.mime, has_audio: ev.has_audio }];
        });
      } else if (m.type === "screen_share_stopped") {
        const streamId = m.stream_id as string;
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
      if (connected && hubId === activeHubIdRef.current) {
        hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
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
      setUsers((prev) => prev.map((u) => u.public_key === publicKey ? { ...u, online: true } : u));
    },
    onMemberOffline: (publicKey, hubId) => {
      if (hubId !== activeHubIdRef.current) return;
      setUsers((prev) => prev.map((u) => u.public_key === publicKey ? { ...u, online: false } : u));
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
    try {
      const [ch, usr, me, convs, alliances, cmds, voiceRoster] = await Promise.allSettled([
        hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>),
        hubFetch("/users").then((r) => r.json() as Promise<User[]>),
        hubFetch("/me").then((r) => r.json() as Promise<MeInfo>),
        hubFetch("/conversations").then((r) => r.json() as Promise<Conversation[]>),
        hubFetch("/alliances").then((r) => r.json() as Promise<AllianceInfo[]>).catch(() => [] as AllianceInfo[]),
        listBotCommands().catch(() => [] as Array<{ command: string; description: string; bot_name: string }>),
        fetchVoiceRoster().catch(() => ({} as Record<string, VoiceParticipant[]>)),
      ]);
      if (ch.status === "fulfilled") {
        setChannels(ch.value);
        if (!selectedChannelRef.current) {
          const first = ch.value.find((c) => !c.is_category && c.channel_type !== "banner" && c.channel_type !== "spawner");
          if (first) setSelectedChannel(first);
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
      if (alliances.status === "fulfilled") {
        const als = alliances.value;
        setUserAlliances(als);
        const byId: Record<string, AllianceSharedChannel[]> = {};
        await Promise.allSettled(
          als.map(async (a) => {
            try {
              const r = await hubFetch(`/alliances/${a.id}/channels`);
              byId[a.id] = await r.json() as AllianceSharedChannel[];
            } catch {
              byId[a.id] = [];
            }
          })
        );
        setAllianceChannels(byId);
      }
      if (cmds.status === "fulfilled") setSlashCommands(cmds.value);
      if (voiceRoster.status === "fulfilled") setVoicePartByChannel(voiceRoster.value);
      const hubId = getActiveHubId();
      if (hubId) {
        getUnreadCounts().then((counts) => seedUnreadFromServer(hubId, counts)).catch(() => {});
      }
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } finally {
      loadingHub.current = false;
    }
  }

  // === Hub management ===

  async function handleSwitchHub(hubId: string) {
    setActiveHub(hubId);
    setActiveHubIdState(hubId);
    setSelectedChannel(null);
    setSelectedConversation(null);
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

  async function handlePreviewHub() {
    setHubPreview({ state: "loading" });
    setAddHubError(null);
    try {
      const info = await previewHubInfo(hubUrl);
      setHubPreview({ state: "ok", url: hubUrl, name: info.name, icon: info.icon });
    } catch (e) {
      setHubPreview({ state: "error", message: String(e) });
    }
  }

  async function handleAddHub() {
    setAddingHub(true);
    setAddHubError(null);
    try {
      const hub = await addHub(hubUrl, stableHandlers, { invite_code: inviteCode || undefined });
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

  async function handleCreateChannel(name: string, channelType: string, isCategory: boolean, description: string, spawnerNameTemplate?: string) {
    if (!createChannelCtx) return;
    setCreateChannelLoading(true);
    setCreateChannelError(null);
    try {
      await hubFetch("/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parent_id: createChannelCtx.parentId ?? undefined,
          is_category: isCategory,
          channel_type: isCategory ? undefined : channelType,
          description: description || undefined,
          spawner_name_template: !isCategory && channelType === "spawner" ? spawnerNameTemplate : undefined,
        }),
      });
      setCreateChannelCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setCreateChannelError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setCreateChannelLoading(false);
    }
  }

  async function handleSaveChannelSettings(name: string, description: string) {
    if (!channelSettingsCtx) return;
    setChannelSettingsSaving(true);
    setChannelSettingsError(null);
    try {
      await hubFetch(`/channels/${channelSettingsCtx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      setChannelSettingsCtx(null);
      hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
    } catch (e) {
      setChannelSettingsError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setChannelSettingsSaving(false);
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

  async function handleSendDm() {
    if (!selectedConversation || !inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    try {
      await sendDm(selectedConversation.id, text);
    } catch {}
  }

  // === Voice ===

  async function handleVoiceJoin(ch: Channel) {
    try {
      const sess = activeSession();
      const session = new VoiceWsSession(sess.hub_url, sess.token, ch.id, {
        // `channelId` is where the join actually landed — for a spawner
        // channel the hub creates a personal sibling room and the join
        // lands there instead, never in the spawner itself.
        onReady: (_senderId, _participants, channelId) => {
          setVoiceChannelId(channelId);
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
          if (channelId !== ch.id) {
            hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>).then(setChannels).catch(() => {});
          }
        },
        onClose: () => {
          voiceSessionRef.current = null;
          videoSessionRef.current?.dispose();
          videoSessionRef.current = null;
          setVoiceChannelId(null);
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
      },
      onError: (msg) => showHubError("Screen share: " + msg),
    });
    try {
      await session.start();
      screenShareSessionRef.current = session;
      setSharing(true);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
    setLocalVideoStream(null);
    setRemoteVideoStreams(new Map());
    setVideoEnabled(false);
  }

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
    const channelId = voiceChannelId;
    // Camera + whisper are scoped to the voice session — tear them down too.
    videoSessionRef.current?.dispose();
    videoSessionRef.current = null;
    setLocalVideoStream(null);
    setRemoteVideoStreams(new Map());
    setVideoEnabled(false);
    if (whisperingTo.length > 0) handleStopWhisper();
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    setVoiceChannelId(null);
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
      try { localStorage.setItem("wavvon.voice_gains", JSON.stringify(next)); } catch {}
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

  // Baseline (hub-role) resolution -- there's no self-service endpoint for a
  // member to read their own channel-scoped effective permissions (the
  // ancestor-chain overwrite fold lives behind GET /channels/:id/permissions,
  // which itself requires manage_roles). This mirrors isAdmin/canManageRoles
  // above rather than being truly channel-scoped; a channel-level deny of
  // use_soundboard for a non-admin's role still shows the button but the
  // server's mark_played check (403) is the actual enforcement either way
  // (soundboard.md §1 Decisions).
  const canUseSoundboard = useMemo(
    () => meInfo?.roles?.some((r) => r.permissions?.includes("admin") || r.permissions?.includes("use_soundboard")) ?? false,
    [meInfo],
  );

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
        if (showSearchBar) { setShowSearchBar(false); return; }
        if (searchOpen) { setSearchOpen(false); return; }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hubs, channels, selectedChannel, messageInputRef, unreadByChannel, showKeyboardShortcuts, showSettings, showHubAdmin, showFarmSettings, showCreateHub, showAddHub, showSearchBar, searchOpen]);

  // === Render ===

  if (ready === "checking") {
    return <div style={{ padding: 32 }}>Loading…</div>;
  }

  if (ready === "setup") {
    return <IdentitySetupScreen onComplete={handleIdentityComplete} />;
  }

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

      {showKeyboardShortcuts && (
        <KeyboardShortcuts onClose={() => setShowKeyboardShortcuts(false)} />
      )}

      {hubs.length === 0 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--bg, #1a1a2e)", overflow: "auto" }}>
          <WelcomeScreenContainer
            wsHandlers={stableHandlers}
            onHubAdded={(hub) => {
              setHubs(listHubs());
              setActiveHubIdState(hub.hub_id);
              void loadHubData();
            }}
            initialHubUrl={homeHubUrl}
            onBrowse={() => setShowDiscover(true)}
          />
        </div>
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

      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--bg, #1a1a2e)", overflow: "auto", display: "flex" }}>
          <SettingsPage
            tab={settingsTab}
            onTab={setSettingsTab}
            onClose={() => setShowSettings(false)}
            hubs={hubs}
            publicKey={publicKey}
            copiedKey={copiedKey}
            onCopyKey={() => handleCopyKeyFn(publicKey)}
            theme={theme}
            onThemeChange={handleSetTheme}
            skin={skin}
            onSkinChange={handleSkinChange}
            onImportSkin={(s) => { handleSkinChange(s); handleSetTheme("custom"); }}
            profiles={namedProfiles}
            defaultProfileId={defaultProfileId}
            mentionPingEnabled={mentionPingEnabled}
            onMentionPingChange={(v) => {
              setMentionPingEnabled(v);
              try { localStorage.setItem("wavvon.mentionPing", v ? "1" : "0"); } catch {}
            }}
            recoveryPhrase={recoveryPhrase}
            onShowRecovery={handleShowRecovery}
            blocks={Array.from(blockedUsers).map((p) => ({ pubkey: p, since: 0 }))}
            ignores={Array.from(ignoredUsers).map((p) => ({ pubkey: p, since: 0 }))}
            onUnblock={toggleBlockUser}
            onUnignore={toggleIgnoreUser}
            knownNames={pubkeyToName}
            onProfileSaved={() => {
              hubFetch("/me").then((r) => r.json() as Promise<MeInfo>).then(setMeInfo).catch(() => {});
              hubFetch("/users").then((r) => r.json() as Promise<User[]>).then(setUsers).catch(() => {});
            }}
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

      {showFarmSettings && (
        <FarmSettingsPage
          farmUrl={farmAdminUrl}
          tab={farmAdminTab}
          onTab={setFarmAdminTab}
          onClose={() => setShowFarmSettings(false)}
        />
      )}

      {showCreateHub && (
        <CreateHubWizard
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
          onClose={() => setShowCreateHub(false)}
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
        view={view as "channels" | "dms"}
        showDiscover={true}
        unreadDms={unreadDms}
        unreadByHub={unreadByHub}
        pingByHub={pingByHub}
        hubNotifyMode={hubNotifyMode}
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
        view={view as "channels" | "dms"}
        activeHubId={activeHubId}
        hubs={hubs}
        channels={channels}
        selectedChannel={selectedChannel}
        unreadByChannel={unreadByChannel}
        collapsedCategories={collapsedCategories}
        voicePartByChannel={voicePartByChannel}
        voiceChannelId={voiceChannelId}
        selfMuted={selfMuted}
        selfDeafened={selfDeafened}
        users={users}
        publicKey={publicKey}
        pingByHub={pingByHub}
        isAdmin={isAdmin}
        hubNotifyMode={hubNotifyMode}
        hubDropdownOpen={hubDropdownOpen}
        userAlliances={userAlliances}
        allianceChannels={allianceChannels}
        selectedAllianceChannel={null}
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
        onClearHubUnread={clearHubUnread}
        onRemoveHub={handleRemoveHub}
        onOpenHubAdmin={() => void openHubAdmin()}
        onOpenHubAdminInvites={() => { void openHubAdmin(); setHubAdminTab("invites"); }}
        onOpenCreateChannel={(parentId, isCategory) => { setCreateChannelCtx({ parentId, isCategory }); setCreateChannelError(null); }}
        onSelectChannel={handleSelectChannel}
        onChannelContextMenu={(e, channel) => { e.preventDefault(); setChannelCtxMenu({ channel, x: e.clientX, y: e.clientY }); }}
        onOpenChannelSettings={(channel) => { setChannelSettingsCtx(channel); setChannelSettingsError(null); }}
        onVoiceJoin={(ch) => ch && void handleVoiceJoin(ch)}
        onVoiceLeave={handleVoiceLeave}
        onSelectAllianceChannel={() => {}}
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
      />

      {activeOpenApp && (
        <BotMiniAppFrame
          event={activeOpenApp.event}
          hubUrl={activeOpenApp.hubUrl}
          onClose={() => setActiveOpenApp(null)}
        />
      )}

      {activeHubId && pendingApprovalHubs.has(activeHubId) ? (
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
        selectedAllianceChannel={null}
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
        voiceChannelId={voiceChannelId}
        onVoiceJoin={() => selectedChannel && void handleVoiceJoin(selectedChannel)}
        onVoiceLeave={handleVoiceLeave}
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
        onSendAllianceMessage={() => {}}
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
        sharing={sharing}
        shareKbps={shareKbps}
        onStartShare={handleStartShare}
        onStopShare={handleStopShare}
        videoEnabled={videoEnabled}
        localVideoStream={localVideoStream}
        remoteVideoStreams={remoteVideoStreams}
        onToggleVideo={handleToggleVideo}
        videoNameFor={(pk) => users.find((u) => u.public_key === pk)?.display_name || pk.slice(0, 8)}
        assertiveAnnouncement={assertiveAnnouncement}
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
            myPubkey={publicKey ?? ""}
            isAdmin={isAdmin}
            canManageSoundboard={canManageSoundboard}
            onCreateInvite={(maxUses, expiresIn) =>
              hubFetch("/invites", { method: "POST", body: JSON.stringify({ max_uses: maxUses, expires_in: expiresIn }) })
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
          onHubUrlChange={(v) => {
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
          }}
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

      {channelSettingsCtx && (
        <ChannelSettingsModal
          channel={channelSettingsCtx}
          saving={channelSettingsSaving}
          deleting={channelSettingsDeleting}
          error={channelSettingsError}
          canManageRoles={canManageRoles}
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
            {!channelCtxMenu.channel.is_category && (
              <button
                className="context-menu-item"
                onClick={async () => {
                  const ch = channelCtxMenu.channel;
                  setChannelCtxMenu(null);
                  const hub = hubs.find((h) => h.hub_id === activeHubId);
                  if (!hub) return;
                  const link = `wavvon://${hub.hub_url.replace(/^https?:\/\//, "")}/channel/${ch.id}`;
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
