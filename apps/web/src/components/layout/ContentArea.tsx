import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  Channel,
  Hub,
  Message,
  DmMessage,
  Attachment,
  User,
  RoleInfo,
  Conversation,
  AllianceSharedChannel,
  VoiceParticipant,
  ActiveStream,
  Poll,
} from "@shared/types";
import { UserListGrouped } from "@components/users/UserListGrouped";
import { BotCard } from "@components/bots/BotCard";
import { UserProfileCard } from "@components/users/UserProfileCard";
import { PinnedMessagesModal } from "@components/content/PinnedMessagesModal";
import { hubFetch, getPolls } from "@platform";
import { activeSession } from "../../platform/session";
import { ScreenShareViewer } from "@components/voice/ScreenShareViewer";
import type { ScreenShareViewerRef } from "@components/voice/ScreenShareViewer";
import { DmView } from "@components/content/DmView";
import { ForumView } from "@components/forum/ForumView";
import { ChannelHeader } from "@components/content/ChannelHeader";
import { ChannelMessageList } from "@components/content/ChannelMessageList";
import { ChannelComposer } from "@components/content/ChannelComposer";
import { PollComposer } from "@components/polls/PollComposer";
import { EventsPanel } from "@components/events/EventsPanel";
import { AllianceView, ReconnectBanner } from "@wavvon/ui";
import { WelcomeInviteBanner } from "./WelcomeInviteBanner";
import { getScoped, setScoped } from "@shared/utils/accountScope";

interface SelectedAllianceChannel {
  alliance_id: string;
  alliance_name: string;
  channel: AllianceSharedChannel;
}

interface TypingEntry { name: string; ts: number }

interface SlashCommandEntry {
  command: string;
  description: string;
  bot_name: string;
}

interface Props {
  view: "channels" | "dms";
  activeHubId: string | null;
  hubs: Hub[];
  channels: Channel[];
  onBreadcrumbCategoryClick: (categoryId: string) => void;
  theme: string;
  selectedChannel: Channel | null;
  selectedConversation: Conversation | null;
  selectedAllianceChannel: SelectedAllianceChannel | null;
  messages: Message[];
  searchResults: Message[] | null;
  searchOpen: boolean;
  searchQuery: string;
  dmMessages: Record<string, DmMessage[]>;
  allianceMessages: Message[];
  users: User[];
  publicKey: string | null;
  blockedUsers: Set<string>;
  knownDisplayNames: Set<string>;
  myDisplayName: string | null;
  isAdmin: boolean;
  myRoles: RoleInfo[];
  editingMessageId: string | null;
  editingDraft: string;
  replyTarget: Message | null;
  pendingAttachments: Attachment[];
  stickToBottom: boolean;
  newWhileScrolledUp: number;
  hubConnected: Record<string, boolean>;
  reconnectingHubs: Record<string, boolean>;
  memberSidebarHidden: boolean;
  voiceActiveUsers: Set<string>;
  myAvatar?: string | null;
  inputText: string;
  typingByKey: Record<string, TypingEntry>;
  dmTypingByKey: Record<string, TypingEntry>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesEndChannelRef: React.RefObject<HTMLLIElement | null>;
  messagesContainerRef: React.RefObject<HTMLOListElement | null>;
  messageInputRef: React.RefObject<HTMLInputElement | null>;
  onReconnect: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onSetReplyTarget: (message: Message | null) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (message: Message) => void;
  onDeleteMessage: (messageId: string) => void;
  onSend: () => void;
  onSendDm: () => void;
  onSendAllianceMessage: () => void;
  onPingTyping: () => void;
  onPingDmTyping: () => void;
  onSetPendingAttachments: (items: Attachment[]) => void;
  onAttachFiles: (files: FileList | null) => void;
  onOpenEditDescription: (channel: Channel) => void;
  firstNotifyingMessageId: string | null;
  onClearFirstNotify: () => void;
  onScrollToMessage: (id: string) => void;
  onSetMemberSidebarHidden: (v: boolean) => void;
  onSetSearchOpen: (v: boolean) => void;
  onSetSearchQuery: (v: string) => void;
  onCloseSearch: () => void;
  onJumpToBottom: () => void;
  onMessagesScroll: () => void;
  onSetUserContextMenu: (menu: { x: number; y: number; user: User } | null) => void;
  onSetEditingDraft: (v: string) => void;
  onInputTextChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onOpenImage: (src: string, alt: string) => void;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
  slashCommands?: SlashCommandEntry[];
  activeScreenShares: ActiveStream[];
  screenShareViewerRef: React.RefObject<ScreenShareViewerRef | null>;
  onOpenHubStreams?: () => void;
  assertiveAnnouncement?: string;
  pinnedMessageIds?: Set<string>;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  onOpenUserProfile?: (pubkey: string) => void;
}

export function ContentArea({
  view, activeHubId, hubs, channels, onBreadcrumbCategoryClick, theme,
  selectedChannel, selectedConversation, selectedAllianceChannel,
  messages, searchResults, searchOpen, searchQuery,
  dmMessages, allianceMessages,
  users, publicKey, blockedUsers, knownDisplayNames, myDisplayName,
  isAdmin, myRoles, editingMessageId, editingDraft, replyTarget,
  pendingAttachments, stickToBottom, newWhileScrolledUp,
  hubConnected, reconnectingHubs, memberSidebarHidden, voiceActiveUsers,
  myAvatar,
  inputText, typingByKey, dmTypingByKey,
  messagesEndRef, messagesEndChannelRef, messagesContainerRef, messageInputRef,
  onReconnect, onToggleReaction, onSetReplyTarget,
  onSaveEdit, onCancelEdit, onStartEdit, onDeleteMessage,
  onSend, onSendDm, onSendAllianceMessage,
  onPingTyping, onPingDmTyping,
  onSetPendingAttachments, onAttachFiles,
  onOpenEditDescription, firstNotifyingMessageId, onClearFirstNotify, onScrollToMessage,
  onSetMemberSidebarHidden, onSetSearchOpen, onSetSearchQuery, onCloseSearch,
  onJumpToBottom, onMessagesScroll,
  onSetUserContextMenu, onSetEditingDraft, onInputTextChange, onKeyDown,
  onOpenImage, onToast, onError,
  slashCommands = [],
  activeScreenShares, screenShareViewerRef,
  onOpenHubStreams,
  assertiveAnnouncement = "",
  pinnedMessageIds = new Set<string>(),
  onPinToggle,
  onOpenUserProfile,
}: Props) {
  const { t } = useTranslation();

  const sessionInfo = useMemo(() => {
    try {
      const s = activeSession();
      return { hubUrl: s.hub_url, token: s.token };
    } catch {
      return null;
    }
  }, [activeHubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommandEntry[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const [botCard, setBotCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number>(-1);
  const messageRowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnnouncementsRef = useRef<string[]>([]);
  const [showPinsModal, setShowPinsModal] = useState(false);
  const [profileCardPubkey, setProfileCardPubkey] = useState<string | null>(null);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [channelPolls, setChannelPolls] = useState<Poll[]>([]);
  const [activeContentTab, setActiveContentTab] = useState<"messages" | "events">("messages");

  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(() => {
    if (!selectedChannel) return new Set();
    try {
      const raw = getScoped(`wavvon.threads.${selectedChannel.id}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>({});

  useEffect(() => {
    if (!selectedChannel) { setExpandedThreads(new Set()); return; }
    try {
      const raw = getScoped(`wavvon.threads.${selectedChannel.id}`);
      setExpandedThreads(new Set(raw ? JSON.parse(raw) : []));
    } catch { setExpandedThreads(new Set()); }
    setThreadReplies({});
  }, [selectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setChannelPolls([]);
    setActiveContentTab("messages");
    if (selectedChannel) {
      getPolls(selectedChannel.id).then(setChannelPolls).catch(() => {});
    }
  }, [selectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistExpandedThreads(next: Set<string>) {
    if (!selectedChannel) return;
    setScoped(`wavvon.threads.${selectedChannel.id}`, JSON.stringify([...next]));
  }

  async function toggleThread(messageId: string) {
    if (expandedThreads.has(messageId)) {
      const next = new Set(expandedThreads);
      next.delete(messageId);
      setExpandedThreads(next);
      persistExpandedThreads(next);
      return;
    }
    if (!selectedChannel) return;
    try {
      const res = await hubFetch(`/channels/${selectedChannel.id}/messages?thread_root=${messageId}`);
      const replies = await res.json() as Message[];
      setThreadReplies((prev) => ({ ...prev, [messageId]: replies }));
      const next = new Set(expandedThreads);
      next.add(messageId);
      setExpandedThreads(next);
      persistExpandedThreads(next);
    } catch { /* silently fail */ }
  }

  useEffect(() => {
    if (document.hidden) return;
    const latestMsg = messages[messages.length - 1];
    if (!latestMsg) return;
    pendingAnnouncementsRef.current.push(`${latestMsg.sender_name ?? 'Unknown'}: ${latestMsg.content}`);
    if (announceTimerRef.current) return;
    announceTimerRef.current = setTimeout(() => {
      const batch = pendingAnnouncementsRef.current.splice(0);
      if (batch.length === 1) {
        setLiveAnnouncement(batch[0]);
      } else {
        setLiveAnnouncement(t("message.count.new_messages", { count: batch.length }));
      }
      announceTimerRef.current = null;
    }, 2000);
  }, [messages]);

  function handleMessageKeyDown(e: React.KeyboardEvent<HTMLLIElement>, index: number, displayedMessages: Message[]) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(index + 1, displayedMessages.length - 1);
      setFocusedMessageIndex(next);
      messageRowRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(index - 1, 0);
      setFocusedMessageIndex(prev);
      messageRowRefs.current[prev]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setFocusedMessageIndex(-1);
    }
  }

  const openBotCard = useCallback((pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBotCard({ pubkey, rect });
  }, []);

  function handleAuthorClick(pubkey: string) {
    if (onOpenUserProfile) {
      onOpenUserProfile(pubkey);
    } else {
      setProfileCardPubkey(pubkey);
    }
  }

  // Same member menu the sidebar member list opens on right-click. The
  // sender may have left the hub since posting, so fall back to a minimal
  // stand-in User built from the message's own denormalised sender fields.
  function handleAuthorContextMenu(e: React.MouseEvent, pubkey: string, fallbackName: string | null) {
    e.preventDefault();
    const user = users.find((u) => u.public_key === pubkey) ?? {
      public_key: pubkey,
      display_name: fallbackName,
      avatar: null,
      online: false,
      group_role: null,
    };
    onSetUserContextMenu({ x: e.clientX, y: e.clientY, user });
  }

  function handleSlashInputChange(value: string) {
    onInputTextChange(value);
    if (value.startsWith("/") && !value.includes(" ")) {
      const prefix = value.slice(1).toLowerCase();
      const matches = slashCommands.filter((s) =>
        s.command.toLowerCase().startsWith(prefix)
      );
      setSlashSuggestions(matches);
      setSlashSelectedIdx(0);
    } else {
      setSlashSuggestions([]);
    }

    const mentionMatch = /@([\w.]*)$/.exec(value);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1].toLowerCase());
      setMentionSelectedIdx(0);
    } else {
      setMentionQuery(null);
    }
  }

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return users
      .filter((u) => {
        const name = (u.display_name ?? "").toLowerCase();
        return name && name.startsWith(mentionQuery);
      })
      .slice(0, 8);
  }, [mentionQuery, users]);

  function fillMention(displayName: string) {
    const next = inputText.replace(/@([\w.]*)$/, `@${displayName} `);
    onInputTextChange(next);
    setMentionQuery(null);
  }

  function fillSlashCommand(command: string) {
    onInputTextChange("/" + command + " ");
    setSlashSuggestions([]);
    setSlashSelectedIdx(0);
  }

  function handleSlashKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionSuggestions.length > 0 && mentionQuery !== null) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIdx((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIdx((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const u = mentionSuggestions[mentionSelectedIdx];
        if (u?.display_name) fillMention(u.display_name);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIdx((i) => (i + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIdx((i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        fillSlashCommand(slashSuggestions[slashSelectedIdx].command);
        return;
      }
      if (e.key === "Escape") {
        setSlashSuggestions([]);
        return;
      }
    }
    if (e.key === "Escape" && replyTarget) {
      e.preventDefault();
      onSetReplyTarget(null);
      return;
    }
    onKeyDown(e);
  }

  function handleComponentInteract(_messageId: string, _customId: string, _values: string[]) {
    // Actual WS send is handled inside MessageComponents via platform session.
  }

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="additions"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>
      <main className="content">
        {activeHubId && hubConnected[activeHubId] === false && (
          <ReconnectBanner
            reconnecting={!!reconnectingHubs[activeHubId]}
            onReconnect={onReconnect}
          />
        )}

        {view === "channels" && activeHubId && activeHub && (
          <WelcomeInviteBanner hubId={activeHubId} hubUrl={activeHub.hub_url} />
        )}

        {view === "dms" ? (
          selectedConversation ? (
            <DmView
              selectedConversation={selectedConversation}
              dmMessages={dmMessages}
              publicKey={publicKey}
              blockedUsers={blockedUsers}
              users={users}
              knownDisplayNames={knownDisplayNames}
              myDisplayName={myDisplayName}
              pendingAttachments={pendingAttachments}
              inputText={inputText}
              dmTypingByKey={dmTypingByKey}
              messagesEndRef={messagesEndRef}
              onSetPendingAttachments={onSetPendingAttachments}
              onAttachFiles={onAttachFiles}
              onInputTextChange={onInputTextChange}
              onPingDmTyping={onPingDmTyping}
              onSendDm={onSendDm}
              onOpenImage={onOpenImage}
            />
          ) : (
            <div className="no-channel"><p>{t("dm.no_selection")}</p></div>
          )
        ) : selectedChannel && selectedChannel.channel_type === "forum" ? (
          <ForumView
            selectedChannel={selectedChannel}
            myRoles={myRoles}
            myPubkey={publicKey}
            isAdmin={isAdmin}
          />
        ) : selectedChannel ? (
          <div className="chat-column">
            <ChannelHeader
              selectedChannel={selectedChannel}
              channels={channels}
              memberSidebarHidden={memberSidebarHidden}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              searchResults={searchResults}
              activeScreenShares={activeScreenShares}
              screenShareViewerRef={screenShareViewerRef}
              isAdmin={isAdmin}
              onShowPinned={() => setShowPinsModal(true)}
              onToggleSearch={() => searchOpen ? onCloseSearch() : onSetSearchOpen(true)}
              onCloseSearch={onCloseSearch}
              onSetSearchQuery={onSetSearchQuery}
              onToggleMemberSidebar={() => onSetMemberSidebarHidden(!memberSidebarHidden)}
              onOpenEditDescription={onOpenEditDescription}
              onOpenHubStreams={onOpenHubStreams}
              onBreadcrumbCategoryClick={onBreadcrumbCategoryClick}
            />
            <div style={{ display: "flex", gap: 4, padding: "0 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              {(["messages", "events"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveContentTab(tab)}
                  style={{
                    padding: "6px 12px",
                    background: "none",
                    border: "none",
                    borderBottom: activeContentTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                    cursor: "pointer",
                    fontSize: "var(--text-sm)",
                    fontWeight: activeContentTab === tab ? 600 : 400,
                    color: activeContentTab === tab ? "var(--text)" : "var(--text-muted)",
                    marginBottom: -1,
                  }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeContentTab === "events" ? (
              <EventsPanel channelId={selectedChannel.id} myPubkey={publicKey} isAdmin={isAdmin} />
            ) : null}

            {activeContentTab === "messages" && <><ChannelMessageList
              selectedChannelName={selectedChannel.name}
              selectedChannelDescription={selectedChannel.description}
              messages={messages}
              searchResults={searchResults}
              blockedUsers={blockedUsers}
              publicKey={publicKey}
              myDisplayName={myDisplayName}
              myRoles={myRoles}
              users={users}
              knownDisplayNames={knownDisplayNames}
              editingMessageId={editingMessageId}
              editingDraft={editingDraft}
              focusedMessageIndex={focusedMessageIndex}
              expandedThreads={expandedThreads}
              threadReplies={threadReplies}
              hubs={hubs}
              activeHubId={activeHubId}
              isAdmin={isAdmin}
              pinnedMessageIds={pinnedMessageIds}
              sessionHubUrl={sessionInfo?.hubUrl ?? null}
              sessionToken={sessionInfo?.token ?? null}
              stickToBottom={stickToBottom}
              newWhileScrolledUp={newWhileScrolledUp}
              firstNotifyingMessageId={firstNotifyingMessageId}
              typingByKey={typingByKey}
              messagesContainerRef={messagesContainerRef}
              messagesEndChannelRef={messagesEndChannelRef}
              messageRowRefs={messageRowRefs}
              channelPolls={channelPolls}
              onPollUpdate={(poll) => setChannelPolls((prev) => prev.map((p) => p.id === poll.id ? poll : p))}
              onPollDelete={(pollId) => setChannelPolls((prev) => prev.filter((p) => p.id !== pollId))}
              onToggleReaction={onToggleReaction}
              onSetReplyTarget={onSetReplyTarget}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onStartEdit={onStartEdit}
              onDeleteMessage={onDeleteMessage}
              onSetEditingDraft={onSetEditingDraft}
              onScrollToMessage={onScrollToMessage}
              onToast={onToast}
              onError={onError}
              onToggleThread={toggleThread}
              onOpenImage={onOpenImage}
              onOpenBotCard={openBotCard}
              onAuthorClick={handleAuthorClick}
              onAuthorContextMenu={handleAuthorContextMenu}
              onPinToggle={onPinToggle}
              onMessagesScroll={onMessagesScroll}
              onJumpToBottom={onJumpToBottom}
              onClearFirstNotify={onClearFirstNotify}
              onMessageKeyDown={handleMessageKeyDown}
              onComponentInteract={handleComponentInteract}
            />
            <ChannelComposer
              channelName={selectedChannel.name}
              activeHubUrl={activeHub?.hub_url}
              inputText={inputText}
              replyTarget={replyTarget}
              pendingAttachments={pendingAttachments}
              users={users}
              publicKey={publicKey}
              slashSuggestions={slashSuggestions}
              slashSelectedIdx={slashSelectedIdx}
              mentionSuggestions={mentionSuggestions}
              mentionSelectedIdx={mentionSelectedIdx}
              mentionQuery={mentionQuery}
              messageInputRef={messageInputRef}
              onInputTextChange={handleSlashInputChange}
              onKeyDown={handleSlashKeyDown}
              onSend={onSend}
              onPingTyping={onPingTyping}
              onAttachFiles={onAttachFiles}
              onSetPendingAttachments={onSetPendingAttachments}
              onSetReplyTarget={onSetReplyTarget}
              onFillMention={fillMention}
              onFillSlashCommand={fillSlashCommand}
              onShowPollComposer={() => setShowPollComposer(true)}
            /></>}
          </div>
        ) : selectedAllianceChannel ? (
          <AllianceView
            selectedAllianceChannel={selectedAllianceChannel}
            allianceMessages={allianceMessages}
            inputText={inputText}
            knownDisplayNames={knownDisplayNames}
            myDisplayName={myDisplayName}
            onInputTextChange={onInputTextChange}
            onSendAllianceMessage={onSendAllianceMessage}
            onOpenImage={onOpenImage}
          />
        ) : (
          <div className="no-channel"><p>{t("channel.no_selection")}</p></div>
        )}
      </main>

      {view === "channels" && !memberSidebarHidden && (
        <aside className="user-list-sidebar" aria-label={t("member.list.title")}>
          <UserListGrouped
            users={users}
            inVoice={voiceActiveUsers}
            onUserClick={(pubkey) => handleAuthorClick(pubkey)}
            onContextMenu={(e, u) => {
              e.preventDefault();
              onSetUserContextMenu({ x: e.clientX, y: e.clientY, user: u });
            }}
            onBotClick={(pubkey, e) => openBotCard(pubkey, e)}
          />
        </aside>
      )}

      {botCard && (
        <BotCard
          pubkey={botCard.pubkey}
          anchorRect={botCard.rect}
          onClose={() => setBotCard(null)}
        />
      )}

      {showPinsModal && selectedChannel && (
        <PinnedMessagesModal
          channelId={selectedChannel.id}
          channelName={selectedChannel.name}
          onClose={() => setShowPinsModal(false)}
          onScrollToMessage={onScrollToMessage}
        />
      )}

      {profileCardPubkey && (
        <UserProfileCard
          pubkey={profileCardPubkey}
          onClose={() => setProfileCardPubkey(null)}
        />
      )}

      {showPollComposer && selectedChannel && (
        <PollComposer
          channelId={selectedChannel.id}
          onCreated={(poll) => {
            setChannelPolls((prev) => [...prev, poll]);
            setShowPollComposer(false);
          }}
          onClose={() => setShowPollComposer(false)}
        />
      )}
    </>
  );
}
