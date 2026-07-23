import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Channel } from "@wavvon/core";
import type {
  Hub,
  Message,
  DmMessage,
  Attachment,
  User,
  RoleInfo,
  Conversation,
  AllianceSharedChannel,
  ActiveStream,
  Poll,
  HubEmoji,
  BotProfile,
  RsvpStatus,
  HubEvent,
} from "../../types";
import { UserListGrouped } from "../users/UserListGrouped";
import { UserProfileCard, type UserProfileCardActions } from "../users/UserProfileCard";
import { ScreenShareViewer, type ScreenShareViewerRef } from "../ScreenShareViewer";
import { AllianceView } from "./AllianceView";
import { BotCard } from "../BotCard";
import { ReconnectBanner } from "./ReconnectBanner";
import { ForumView, type ForumActions } from "../forum/ForumView";
import { PollComposer } from "../polls/PollComposer";
import { EventsPanel } from "../events/EventsPanel";
import type { CreateEventPayload } from "../events/EventComposer";
import type { EventStagingCapability } from "../events/EventCard";
import { ChannelHeader } from "./ChannelHeader";
import { ChannelComposer } from "./ChannelComposer";
import { ChannelMessageList } from "./ChannelMessageList";
import type { MessageRowActions } from "./MessageRow";
import { DmView } from "./DmView";
import { WelcomeInviteBanner } from "./WelcomeInviteBanner";

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
  ignoredUsers: Set<string>;
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
  selfInvisible?: boolean;
  /** Viewer opt-out from the 🎂 badge (member list + message author rows). */
  hideBirthdays?: boolean;
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
  /** Present only on platforms with an in-chat-column live viewer (web).
   *  Desktop surfaces screen shares through its own always-mounted overlay
   *  instead, so it omits both. */
  activeScreenShares?: ActiveStream[];
  screenShareViewerRef?: React.RefObject<ScreenShareViewerRef | null>;
  onOpenHubStreams: () => void;
  pinnedMessageIds?: Set<string>;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  onOpenUserProfile?: (pubkey: string) => void;
  onStartConversation?: (pubkey: string) => void;
  onShowPinned: () => void;
  profileCardActions: UserProfileCardActions;

  // Per-app platform wiring (built by the caller; see forumActions/messageRowActions
  // precedent -- packages/ui never imports @platform or Tauri's invoke directly).
  forumActions: ForumActions;
  messageRowActions: MessageRowActions;
  loadBotProfile: (pubkey: string) => Promise<BotProfile>;
  loadHubEmojis: () => Promise<HubEmoji[]>;
  loadChannelPolls: (channelId: string) => Promise<Poll[]>;
  loadThreadReplies: (channelId: string, messageId: string) => Promise<Message[]>;
  loadExpandedThreads: (channelId: string) => Set<string>;
  saveExpandedThreads: (channelId: string, ids: Set<string>) => void;
  onComponentInteract: (messageId: string, customId: string, values: string[]) => void;
  onCreatePoll: (channelId: string, question: string, options: string[]) => Promise<Poll>;
  loadWelcomeInfo: (hubUrl: string) => Promise<{ welcome_label: string | null; welcome_invite_url: string | null }>;
  isWelcomeDismissed: (hubId: string) => boolean;
  dismissWelcome: (hubId: string) => void;

  // Events panel (events.md §7.5). `eventsPresentation` picks the chrome
  // each app already shipped -- web's inline messages/events tab strip vs
  // desktop's on-demand modal overlay -- rather than forcing either app to
  // change its shipped UX for this hoist.
  eventsPresentation: "tabs" | "modal";
  getEvents: (params?: { upcoming?: boolean; limit?: number }) => Promise<HubEvent[]>;
  deleteEvent: (eventId: string) => Promise<void>;
  rsvpEvent: (eventId: string, status: RsvpStatus, slotId?: string) => Promise<void>;
  createEvent: (payload: CreateEventPayload) => Promise<HubEvent>;
  eventStaging?: EventStagingCapability;
}

export function ContentArea({
  view, activeHubId, hubs, channels, onBreadcrumbCategoryClick,
  selectedChannel, selectedConversation, selectedAllianceChannel,
  messages, searchResults, searchOpen, searchQuery,
  dmMessages, allianceMessages,
  users, publicKey, blockedUsers, ignoredUsers, knownDisplayNames, myDisplayName,
  isAdmin, myRoles, editingMessageId, editingDraft, replyTarget,
  pendingAttachments, stickToBottom, newWhileScrolledUp,
  hubConnected, reconnectingHubs, memberSidebarHidden, voiceActiveUsers,
  selfInvisible,
  hideBirthdays,
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
  activeScreenShares = [], screenShareViewerRef,
  onOpenHubStreams,
  pinnedMessageIds = new Set<string>(),
  onPinToggle,
  onOpenUserProfile,
  onStartConversation,
  onShowPinned,
  profileCardActions,
  forumActions, messageRowActions,
  loadBotProfile, loadHubEmojis, loadChannelPolls, loadThreadReplies,
  loadExpandedThreads, saveExpandedThreads,
  onComponentInteract, onCreatePoll,
  loadWelcomeInfo, isWelcomeDismissed, dismissWelcome,
  eventsPresentation, getEvents, deleteEvent, rsvpEvent, createEvent, eventStaging,
}: Props) {
  const { t } = useTranslation();

  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommandEntry[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const [botCard, setBotCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number>(-1);
  const messageRowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const isComposing = useRef(false);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnnouncementsRef = useRef<string[]>([]);
  const [profileCardPubkey, setProfileCardPubkey] = useState<string | null>(null);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [channelPolls, setChannelPolls] = useState<Poll[]>([]);
  const [activeContentTab, setActiveContentTab] = useState<"messages" | "events">("messages");
  const [showEventsModal, setShowEventsModal] = useState(false);

  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(() =>
    selectedChannel ? loadExpandedThreads(selectedChannel.id) : new Set()
  );
  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>({});

  useEffect(() => {
    setExpandedThreads(selectedChannel ? loadExpandedThreads(selectedChannel.id) : new Set());
    setThreadReplies({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel?.id]);

  useEffect(() => {
    setChannelPolls([]);
    setActiveContentTab("messages");
    if (selectedChannel) {
      loadChannelPolls(selectedChannel.id).then(setChannelPolls).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel?.id]);

  // Hub custom-emoji `:name:` shortcode resolution for message content.
  const [hubEmojis, setHubEmojis] = useState<HubEmoji[]>([]);
  useEffect(() => {
    if (!activeHubId) return;
    loadHubEmojis().then(setHubEmojis).catch(() => setHubEmojis([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHubId]);
  const hubEmojiMap = useMemo(() => {
    const map = new Map<string, HubEmoji>();
    for (const e of hubEmojis) map.set(e.name, e);
    return map;
  }, [hubEmojis]);

  async function toggleThread(messageId: string) {
    if (expandedThreads.has(messageId)) {
      const next = new Set(expandedThreads);
      next.delete(messageId);
      setExpandedThreads(next);
      if (selectedChannel) saveExpandedThreads(selectedChannel.id, next);
      return;
    }
    if (!selectedChannel) return;
    try {
      const replies = await loadThreadReplies(selectedChannel.id, messageId);
      setThreadReplies((prev) => ({ ...prev, [messageId]: replies }));
      const next = new Set(expandedThreads);
      next.add(messageId);
      setExpandedThreads(next);
      saveExpandedThreads(selectedChannel.id, next);
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
  }, [messages, t]);

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
      messageInputRef.current?.focus();
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

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);

  const eventsPanel = selectedChannel && (
    <EventsPanel
      channelId={selectedChannel.id}
      myPubkey={publicKey}
      isAdmin={isAdmin}
      channels={channels}
      getEvents={getEvents}
      deleteEvent={deleteEvent}
      rsvpEvent={rsvpEvent}
      createEvent={createEvent}
      advancedFieldsSupported
      slotClaimSupported
      staging={eventStaging}
    />
  );

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
          <WelcomeInviteBanner
            hubId={activeHubId}
            hubUrl={activeHub.hub_url}
            loadHubInfo={loadWelcomeInfo}
            isDismissed={isWelcomeDismissed}
            dismiss={dismissWelcome}
          />
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
            channelId={selectedChannel.id}
            myRoles={myRoles}
            myPubkey={publicKey}
            isAdmin={isAdmin}
            actions={forumActions}
            forumRequireTag={selectedChannel.forum_require_tag ?? false}
            users={users}
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
              isAdmin={isAdmin}
              onShowPinned={onShowPinned}
              onToggleSearch={() => searchOpen ? onCloseSearch() : onSetSearchOpen(true)}
              onCloseSearch={onCloseSearch}
              onSetSearchQuery={onSetSearchQuery}
              onToggleMemberSidebar={() => onSetMemberSidebarHidden(!memberSidebarHidden)}
              onOpenEditDescription={onOpenEditDescription}
              onOpenHubStreams={onOpenHubStreams}
              onBreadcrumbCategoryClick={onBreadcrumbCategoryClick}
            />
            {activeScreenShares.length > 0 && screenShareViewerRef && (
              <ScreenShareViewer
                ref={screenShareViewerRef}
                streams={activeScreenShares}
              />
            )}

            {eventsPresentation === "tabs" ? (
              <>
                <div className="content-area-tabs">
                  {(["messages", "events"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveContentTab(tab)}
                      className={`content-area-tab${activeContentTab === tab ? " active" : ""}`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                {activeContentTab === "events" && eventsPanel}
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px" }}>
                <button
                  onClick={() => setShowEventsModal(true)}
                  className="btn-icon-header"
                  title="Events"
                  aria-label="Events"
                >
                  📅
                </button>
              </div>
            )}

            {(eventsPresentation === "modal" || activeContentTab === "messages") && <>
            <ChannelMessageList
              selectedChannelName={selectedChannel.name}
              selectedChannelDescription={selectedChannel.description}
              messages={messages}
              searchResults={searchResults}
              blockedUsers={blockedUsers}
              ignoredUsers={ignoredUsers}
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
              sessionHubUrl={activeHub?.hub_url ?? null}
              hideBirthdays={hideBirthdays}
              hubEmojiMap={hubEmojiMap}
              hubBaseUrl={activeHub?.hub_url}
              actions={messageRowActions}
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
              onComponentInteract={onComponentInteract}
            />
            <ChannelComposer
              channelName={selectedChannel.name}
              activeHubUrl={activeHub?.hub_url}
              inputText={inputText}
              replyTarget={replyTarget}
              pendingAttachments={pendingAttachments}
              users={users}
              slashSuggestions={slashSuggestions}
              slashSelectedIdx={slashSelectedIdx}
              mentionSuggestions={mentionSuggestions}
              mentionSelectedIdx={mentionSelectedIdx}
              mentionQuery={mentionQuery}
              isComposing={isComposing}
              messageInputRef={messageInputRef}
              loadHubEmojis={loadHubEmojis}
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
        ) : selectedAllianceChannel && selectedAllianceChannel.channel.channel_type === "forum" ? (
          <ForumView
            channelId={selectedAllianceChannel.channel.channel_id}
            myRoles={myRoles}
            myPubkey={publicKey}
            isAdmin={isAdmin}
            actions={forumActions}
            users={users}
            allianceContext={{
              allianceId: selectedAllianceChannel.alliance_id,
              allianceName: selectedAllianceChannel.alliance_name,
              hubName: selectedAllianceChannel.channel.hub_name,
              forumRemoteWrite: selectedAllianceChannel.channel.forum_remote_write ?? "replies_only",
            }}
          />
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
            myPubkey={publicKey}
            selfInvisible={selfInvisible}
            hideBirthdays={hideBirthdays}
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
          loadBotProfile={loadBotProfile}
          channelId={selectedChannel?.id ?? null}
          onPlay={messageRowActions.sendBotAppJoin}
        />
      )}

      {profileCardPubkey && (
        <UserProfileCard
          pubkey={profileCardPubkey}
          myPubkey={publicKey}
          activeHubId={activeHubId}
          actions={profileCardActions}
          onClose={() => setProfileCardPubkey(null)}
          onStartConversation={onStartConversation ? (pubkey) => {
            setProfileCardPubkey(null);
            onStartConversation(pubkey);
          } : undefined}
        />
      )}

      {showPollComposer && selectedChannel && (
        <PollComposer
          channelId={selectedChannel.id}
          onCreatePoll={onCreatePoll}
          onCreated={(poll) => {
            setChannelPolls((prev) => [...prev, poll]);
            setShowPollComposer(false);
          }}
          onClose={() => setShowPollComposer(false)}
        />
      )}

      {eventsPresentation === "modal" && showEventsModal && (
        <div className="modal-overlay" onClick={() => setShowEventsModal(false)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setShowEventsModal(false)} aria-label="Close">✕</button>
            </div>
            {eventsPanel}
          </div>
        </div>
      )}
    </>
  );
}
