import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useUnreadCounts } from "./hooks/useUnreadCounts";
import { useNotificationPrefs } from "./hooks/useNotificationPrefs";
import { useTypingIndicators } from "./hooks/useTypingIndicators";
import { useHubConnection } from "./hooks/useHubConnection";
import { useHubAdmin } from "./hooks/useHubAdmin";
import { useSettingsProfile } from "./hooks/useSettingsProfile";
import { useFarmAdmin } from "./hooks/useFarmAdmin";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { flattenTree, descendantIds, computeDepth } from "@voxply/utils";
import type {
  Channel,
  Attachment,
  Message,
  NotifyMode,
  User,
  VoiceParticipant,
  Hub,
  MeInfo,
  InstalledGame,
  Conversation,
  DmMessage,
  AllianceInfo,
  AllianceSharedChannel,
} from "@shared/types";
import { HubSidebar } from "@components/HubSidebar";
import { ChannelSidebar } from "@components/ChannelSidebar";
import { ContentArea } from "@components/ContentArea";
import { AddHubModal } from "@components/AddHubModal";
import { FarmSettingsPage } from "@components/FarmSettingsPage";
import { CreateHubWizard } from "@components/CreateHubWizard";
import { KeyboardShortcuts } from "@components/KeyboardShortcuts";
import { HubAdminPage } from "./components/HubAdminPage";
import { SearchBar } from "@components/SearchBar";
import { WelcomeScreenContainer } from "@components/WelcomeScreen";
import { SettingsPage } from "@components/SettingsPage";
import { UserContextMenu } from "@components/UserContextMenu";
import { MobileShell } from "@components/MobileShell";
import { buildChannelTree } from "@voxply/utils";
import type { TreeNode } from "@voxply/utils";
import { saveDraft, loadDraft, clearDraft } from "./utils/drafts";
import type { ScreenShareViewerRef } from "@components/ScreenShareViewer";
import { listBotCommands, updateDmBlocks, fetchVoiceRoster } from "@platform";
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
type View = "channels" | "dms" | "game";
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
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>Seed hex (alternative backup): <code>{generatedSeed}</code></p>
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
      <h1>Voxply</h1>
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

  // === Hub data ===
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meInfo, setMeInfo] = useState<MeInfo | null>(null);
  const [voicePartByChannel, setVoicePartByChannel] = useState<Record<string, VoiceParticipant[]>>({});
  const [voiceActiveUsers] = useState<Set<string>>(new Set());
  const [installedGames, setInstalledGames] = useState<InstalledGame[]>([]);
  const [slashCommands, setSlashCommands] = useState<Array<{ command: string; description: string; bot_name: string }>>([]);
  const [userAlliances, setUserAlliances] = useState<AllianceInfo[]>([]);
  const [allianceChannels] = useState<Record<string, AllianceSharedChannel[]>>({});

  // === View ===
  const [view, setView] = useState<View>("channels");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedGame, setSelectedGame] = useState<InstalledGame | null>(null);

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
      const raw = localStorage.getItem("voxply.ignoredUsers");
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
      try { localStorage.setItem("voxply.ignoredUsers", JSON.stringify(Array.from(next))); } catch {}
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
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try { return localStorage.getItem("voxply.seenWelcome") !== "1"; } catch { return true; }
  });
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
  const { typingByKey, dmTypingByKey, receiveTyping, pingTyping, pingDmTyping } = useTypingIndicators(
    () => selectedChannelIdRef.current,
    () => selectedConvIdRef.current,
    () => publicKeyRef.current,
  );

  // === Refs ===
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesEndChannelRef = useRef<HTMLLIElement | null>(null);
  const messagesContainerRef = useRef<HTMLOListElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const screenShareViewerRef = useRef<ScreenShareViewerRef | null>(null);

  const loadingHub = useRef(false);

  // Voice-not-available toast
  const [voiceToast, setVoiceToast] = useState(false);

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
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) Voxply` : "Voxply";
  }, [unreadByHub]);

  // === WS handlers (stable via ref) ===

  const activeHubIdRef = useRef<string | null>(null);
  useEffect(() => { activeHubIdRef.current = activeHubId; }, [activeHubId]);

  const hubsRef = useRef<Hub[]>([]);
  useEffect(() => { hubsRef.current = hubs; }, [hubs]);

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
          setMessages((prev) => prev.map((x) => x.id === msgId ? { ...x, reactions } : x));
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
    onVoiceState: (raw) => {
      const m = raw as { type?: string; channel_id?: string; participants?: VoiceParticipant[]; participant?: VoiceParticipant; public_key?: string; _hub_id?: string };
      if (m._hub_id !== activeHubIdRef.current) return;
      if (!m.channel_id) return;
      const channelId = m.channel_id;

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
      } else if (m.type === "voice_participant_joined") {
        if (!m.participant) return;
        const joined = m.participant;
        setVoicePartByChannel((prev) => {
          const existing = prev[channelId] ?? [];
          if (existing.some((p) => p.public_key === joined.public_key)) return prev;
          return { ...prev, [channelId]: [...existing, joined] };
        });
      } else if (m.participants) {
        setVoicePartByChannel((prev) => ({ ...prev, [channelId]: m.participants! }));
      }
    },
    onTyping: (raw) => {
      receiveTyping(raw as Record<string, unknown>);
    },
    onScreenShare: () => {},
    onStatusChange: (connected, hubId) => {
      const hubName = hubsRef.current.find((h) => h.hub_id === hubId)?.hub_name ?? "hub";
      handleStatusChange(hubId, hubName, connected, setAssertiveAnnouncement);
    },
    onError: (raw) => {
      const m = raw as Record<string, unknown>;
      if (m._hub_id !== activeHubIdRef.current) return;
      const message = (m.message as string | undefined) ?? "An error occurred on the hub.";
      showHubError(message);
    },
    onReauthNeeded: (hubId) => {
      reauthorizeHub(hubId, stableHandlersRef.current).then(() => {
        if (hubId === activeHubIdRef.current) void loadHubData();
      }).catch(() => {});
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  stableHandlersRef.current = stableHandlers;

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
      const globalHomeHub = window.__VOXPLY_HOME_HUB__;
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
      const [ch, usr, me, convs, games, alliances, cmds, voiceRoster] = await Promise.allSettled([
        hubFetch("/channels").then((r) => r.json() as Promise<Channel[]>),
        hubFetch("/users").then((r) => r.json() as Promise<User[]>),
        hubFetch("/me").then((r) => r.json() as Promise<MeInfo>),
        hubFetch("/conversations").then((r) => r.json() as Promise<Conversation[]>),
        hubFetch("/hub/games").then((r) => r.json() as Promise<InstalledGame[]>),
        hubFetch("/alliances").then((r) => r.json() as Promise<AllianceInfo[]>).catch(() => [] as AllianceInfo[]),
        listBotCommands().catch(() => [] as Array<{ command: string; description: string; bot_name: string }>),
        fetchVoiceRoster().catch(() => ({} as Record<string, VoiceParticipant[]>)),
      ]);
      if (ch.status === "fulfilled") setChannels(ch.value);
      if (usr.status === "fulfilled") setUsers(usr.value);
      if (me.status === "fulfilled") setMeInfo(me.value);
      if (convs.status === "fulfilled") setConversations(convs.value);
      if (games.status === "fulfilled") setInstalledGames(games.value);
      if (alliances.status === "fulfilled") setUserAlliances(alliances.value);
      if (cmds.status === "fulfilled") setSlashCommands(cmds.value);
      if (voiceRoster.status === "fulfilled") setVoicePartByChannel(voiceRoster.value);
      const hubId = getActiveHubId();
      if (hubId) {
        getUnreadCounts().then((counts) => seedUnreadFromServer(hubId, counts)).catch(() => {});
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
    } catch (e) {
      setAddHubError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setAddingHub(false);
    }
  }

  // === Channel / messages ===

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
    try {
      const msgs = await getMessages(ch.id);
      setMessages(msgs);
      setStickToBottom(true);
      setNewWhileScrolledUp(0);
    } catch {}
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

  // === Voice (not available in browser) ===

  function showVoiceNotAvailable() {
    setVoiceToast(true);
    setTimeout(() => setVoiceToast(false), 4000);
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

  const myRoles = useMemo(() => meInfo?.roles ?? [], [meInfo]);

  const canManageGames = useMemo(
    () => myRoles.some((r) => r.permissions?.includes("manage_games") || r.permissions?.includes("admin")),
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
      {voiceToast && (
        <div
          style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-md)", padding: "8px 16px", zIndex: 9999,
            fontSize: "var(--text-sm)", color: "var(--text)",
          }}
        >
          Voice is not available in the browser client. Open Voxply on your desktop to join.
        </div>
      )}

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

      {showWelcome && hubs.length === 0 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "var(--bg, #1a1a2e)", overflow: "auto" }}>
          <WelcomeScreenContainer
            wsHandlers={stableHandlers}
            onHubAdded={(hub) => {
              setHubs(listHubs());
              setActiveHubIdState(hub.hub_id);
              setShowWelcome(false);
              try { localStorage.setItem("voxply.seenWelcome", "1"); } catch {}
              void loadHubData();
            }}
            onDismiss={() => {
              setShowWelcome(false);
              try { localStorage.setItem("voxply.seenWelcome", "1"); } catch {}
            }}
            initialHubUrl={homeHubUrl}
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
              try { localStorage.setItem("voxply.mentionPing", v ? "1" : "0"); } catch {}
            }}
            recoveryPhrase={recoveryPhrase}
            onShowRecovery={handleShowRecovery}
            blocks={Array.from(blockedUsers).map((p) => ({ pubkey: p, since: 0 }))}
            ignores={Array.from(ignoredUsers).map((p) => ({ pubkey: p, since: 0 }))}
            onUnblock={toggleBlockUser}
            onUnignore={toggleIgnoreUser}
            knownNames={pubkeyToName}
          />
        </div>
      )}

      {userContextMenu && (
        <UserContextMenu
          pubkey={userContextMenu.pubkey}
          displayName={userContextMenu.displayName}
          isAdmin={isAdmin}
          position={userContextMenu.position}
          onClose={() => setUserContextMenu(null)}
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
        showDiscover={false}
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
        onDiscover={() => {}}
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
        voiceChannelId={null}
        selfMuted={false}
        selfDeafened={false}
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
        onOpenCreateChannel={() => {}}
        onSelectChannel={handleSelectChannel}
        onChannelContextMenu={() => {}}
        onVoiceJoin={() => showVoiceNotAvailable()}
        onVoiceLeave={() => {}}
        onSelectAllianceChannel={() => {}}
        onSelectConversation={handleSelectConversation}
        onOpenFriends={() => {}}
        onToggleSelfMute={() => {}}
        onToggleSelfDeafen={() => {}}
        onOpenSettings={() => setShowSettings(true)}
        onDragEnd={handleChannelDragEnd}
        sharing={false}
        onScreenShare={() => {}}
      />

      <ContentArea
        view={view as "channels" | "dms"}
        activeHubId={activeHubId}
        hubs={hubs}
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
        installedGames={installedGames}
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
        onScrollToMessage={() => {}}
        onSetMemberSidebarHidden={setMemberSidebarHidden}
        onSetSearchOpen={setSearchOpen}
        onSetSearchQuery={setSearchQuery}
        onCloseSearch={() => { setSearchOpen(false); setSearchResults(null); setSearchQuery(""); }}
        onJumpToBottom={() => { setStickToBottom(true); setNewWhileScrolledUp(0); }}
        onMessagesScroll={() => {}}
        onSetUserContextMenu={() => {}}
        onSetEditingDraft={setEditingDraft}
        onInputTextChange={(v) => {
          setInputText(v);
          if (activeHubId && selectedChannel) saveDraft(`${activeHubId}/${selectedChannel.id}`, v);
        }}
        onKeyDown={handleKeyDown}
        onOpenImage={() => {}}
        onToast={() => {}}
        onError={() => {}}
        slashCommands={slashCommands}
        activeScreenShares={[]}
        screenShareViewerRef={screenShareViewerRef}
        assertiveAnnouncement={assertiveAnnouncement}
      />
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
            roles={meInfo?.roles ?? []}
            members={hubAdminMembers}
            onKickMember={(pk) => hubFetch(`/moderation/kick`, { method: "POST", body: JSON.stringify({ target_public_key: pk }) }).catch(() => {})}
            onBanMember={(pk) => hubFetch(`/moderation/bans`, { method: "POST", body: JSON.stringify({ target_public_key: pk }) }).catch(() => {})}
            bans={hubAdminBans}
            onUnban={(pk) => hubFetch(`/moderation/bans/${pk}`, { method: "DELETE" }).catch(() => {})}
            invites={hubAdminInvites}
            activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
            myPubkey={publicKey ?? ""}
            isAdmin={isAdmin}
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
          onHubUrlChange={(v) => { setHubUrl(v); setHubPreview({ state: "idle" }); setAddHubError(null); }}
          hubPreview={hubPreview}
          inviteCode={inviteCode}
          onInviteCodeChange={setInviteCode}
          loading={addingHub}
          error={addHubError}
          onAdd={handleAddHub}
          onClose={() => { setShowAddHub(false); setHubPreview({ state: "idle" }); setAddHubError(null); }}
        />
      )}
    </div>
  );
}
