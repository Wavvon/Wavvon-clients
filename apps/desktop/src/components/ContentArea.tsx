import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  PostSummary,
  LinkPreview,
} from "../types";
import { ForumView } from "./content/ForumView";
import { UserListGrouped } from "./UserListGrouped";
import { BotCard } from "./BotCard";
import { UserProfileCard } from "./UserProfileCard";
import { PinnedMessages } from "./PinnedMessages";
import { PollComposer } from "./PollComposer";
import { EventsPanel } from "./EventsPanel";
import { DmView } from "./content/DmView";
import { ChannelHeader } from "./content/ChannelHeader";
import { ChannelMessageList } from "./content/ChannelMessageList";
import { ChannelComposer } from "./content/ChannelComposer";
import { AllianceView, ReconnectBanner } from "@voxply/ui";

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
  voiceChannelId: string | null;
  onVoiceJoin: () => void;
  onVoiceLeave: () => void;
  myAvatar: string | null;
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
  sharing: boolean;
  shareKbps: number;
  onStopShare: () => void;
  onComponentInteract?: (messageId: string, customId: string, values: string[]) => void;
  assertiveAnnouncement?: string;
}

export function ContentArea({
  view, activeHubId, hubs, theme,
  selectedChannel, selectedConversation, selectedAllianceChannel,
  messages, searchResults, searchOpen, searchQuery,
  dmMessages, allianceMessages,
  users, publicKey, blockedUsers, ignoredUsers, knownDisplayNames, myDisplayName,
  isAdmin, myRoles, editingMessageId, editingDraft, replyTarget,
  pendingAttachments, stickToBottom, newWhileScrolledUp,
  hubConnected, reconnectingHubs, memberSidebarHidden, voiceActiveUsers, voiceChannelId, onVoiceJoin, onVoiceLeave,
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
  sharing, shareKbps, onStopShare,
  onComponentInteract,
  assertiveAnnouncement = "",
}: Props) {
  const { t } = useTranslation();
  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommandEntry[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<User[]>([]);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const [mentionAnchor, setMentionAnchor] = useState<number>(-1);
  const [botCard, setBotCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [profileCard, setProfileCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [showEventsPanel, setShowEventsPanel] = useState(false);
  const [forumSelectedPost, setForumSelectedPost] = useState<PostSummary | null>(null);
  const [forumComposing, setForumComposing] = useState(false);
  // Track IME composition so we don't reset the input value mid-emoji on Windows.
  const isComposing = React.useRef(false);

  useEffect(() => {
    setForumSelectedPost(null);
    setForumComposing(false);
  }, [selectedChannel?.id]);
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number>(-1);
  const messageRowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnnouncementsRef = useRef<string[]>([]);

  interface HubEmojiEntry { id: string; name: string; url: string; }
  const [hubEmojis, setHubEmojis] = useState<HubEmojiEntry[]>([]);
  useEffect(() => {
    if (!activeHubId) return;
    invoke<HubEmojiEntry[]>("list_hub_emojis")
      .then(setHubEmojis)
      .catch(() => setHubEmojis([]));
  }, [activeHubId]);

  const hubEmojiMap = useMemo(() => {
    const map = new Map<string, HubEmojiEntry>();
    for (const e of hubEmojis) map.set(e.name, e);
    return map;
  }, [hubEmojis]);

  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(() => {
    if (!selectedChannel) return new Set();
    try {
      const raw = localStorage.getItem(`voxply.threads.${selectedChannel.id}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>({});

  useEffect(() => {
    if (!selectedChannel) { setExpandedThreads(new Set()); return; }
    try {
      const raw = localStorage.getItem(`voxply.threads.${selectedChannel.id}`);
      setExpandedThreads(new Set(raw ? JSON.parse(raw) : []));
    } catch { setExpandedThreads(new Set()); }
    setThreadReplies({});
  }, [selectedChannel?.id]);

  function persistExpandedThreads(next: Set<string>) {
    if (!selectedChannel) return;
    localStorage.setItem(`voxply.threads.${selectedChannel.id}`, JSON.stringify([...next]));
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
      const replies = await invoke<Message[]>("get_thread_replies", {
        channelId: selectedChannel.id,
        threadRoot: messageId,
      });
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

  const openBotCard = useCallback((pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBotCard({ pubkey, rect });
  }, []);

  const openProfileCard = useCallback((pubkey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProfileCard({ pubkey, rect });
  }, []);

  const activeHub = hubs.find((h) => h.hub_id === activeHubId);

  function handleComponentInteract(messageId: string, customId: string, values: string[]) {
    if (onComponentInteract) {
      onComponentInteract(messageId, customId, values);
    } else {
      const hubUrl = activeHub?.hub_url ?? "";
      invoke("send_component_interaction", { hubUrl, messageId, customId, values }).catch(() => {});
    }
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
      setMentionSuggestions([]);
      setMentionAnchor(-1);
      return;
    }
    setSlashSuggestions([]);

    const atIdx = value.lastIndexOf("@");
    if (atIdx >= 0) {
      const tail = value.slice(atIdx + 1);
      if (!tail.includes(" ")) {
        const lower = tail.toLowerCase();
        const matches = users
          .filter((u) => u.display_name && u.display_name.toLowerCase().startsWith(lower))
          .slice(0, 8);
        if (matches.length > 0) {
          setMentionSuggestions(matches);
          setMentionSelectedIdx(0);
          setMentionAnchor(atIdx);
          return;
        }
      }
    }
    setMentionSuggestions([]);
    setMentionAnchor(-1);
  }

  function fillMention(user: User) {
    if (mentionAnchor < 0 || !user.display_name) return;
    const before = inputText.slice(0, mentionAnchor);
    const after = inputText.slice(mentionAnchor + 1 + (inputText.slice(mentionAnchor + 1).split(" ")[0].length));
    onInputTextChange(`${before}@${user.display_name} ${after}`);
    setMentionSuggestions([]);
    setMentionAnchor(-1);
    setMentionSelectedIdx(0);
  }

  function fillSlashCommand(command: string) {
    onInputTextChange("/" + command + " ");
    setSlashSuggestions([]);
    setSlashSelectedIdx(0);
  }

  function handleMessageKeyDown(e: React.KeyboardEvent<HTMLLIElement>, index: number, displayedMessages: typeof messages) {
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

  function handleSlashKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionSuggestions.length > 0) {
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
        fillMention(mentionSuggestions[mentionSelectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMentionSuggestions([]);
        setMentionAnchor(-1);
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
              isComposing={isComposing}
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
            activeHubUrl={activeHub?.hub_url ?? ""}
            users={users}
            myRoles={myRoles}
            myPubkey={publicKey}
            forumSelectedPost={forumSelectedPost}
            forumComposing={forumComposing}
            onSetForumSelectedPost={setForumSelectedPost}
            onSetForumComposing={setForumComposing}
          />
        ) : selectedChannel ? (
          <>
            <ChannelHeader
              selectedChannel={selectedChannel}
              voiceChannelId={voiceChannelId}
              memberSidebarHidden={memberSidebarHidden}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              searchResults={searchResults}
              sharing={sharing}
              shareKbps={shareKbps}
              isAdmin={isAdmin}
              onVoiceJoin={onVoiceJoin}
              onVoiceLeave={onVoiceLeave}
              onShowPinned={() => setShowPinned(true)}
              onShowEvents={() => setShowEventsPanel(true)}
              onToggleSearch={() => searchOpen ? onCloseSearch() : onSetSearchOpen(true)}
              onCloseSearch={onCloseSearch}
              onSetSearchQuery={onSetSearchQuery}
              onToggleMemberSidebar={() => onSetMemberSidebarHidden(!memberSidebarHidden)}
              onOpenEditDescription={onOpenEditDescription}
              onStopShare={onStopShare}
            />
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
              activeHub={activeHub}
              hubEmojiMap={hubEmojiMap}
              expandedThreads={expandedThreads}
              threadReplies={threadReplies}
              hubs={hubs}
              activeHubId={activeHubId}
              isAdmin={isAdmin}
              stickToBottom={stickToBottom}
              newWhileScrolledUp={newWhileScrolledUp}
              firstNotifyingMessageId={firstNotifyingMessageId}
              typingByKey={typingByKey}
              messagesContainerRef={messagesContainerRef}
              messagesEndChannelRef={messagesEndChannelRef}
              messageRowRefs={messageRowRefs}
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
              onOpenProfileCard={openProfileCard}
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
              showPollButton={!!(selectedChannel && activeHub)}
              isComposing={isComposing}
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
            />
          </>
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
            onContextMenu={(e, u) => {
              e.preventDefault();
              onSetUserContextMenu({ x: e.clientX, y: e.clientY, user: u });
            }}
            onBotClick={(pubkey, e) => openBotCard(pubkey, e)}
          />
        </aside>
      )}

      {botCard && activeHub && (
        <BotCard
          pubkey={botCard.pubkey}
          hubUrl={activeHub.hub_url}
          anchorRect={botCard.rect}
          onClose={() => setBotCard(null)}
        />
      )}

      {profileCard && activeHub && (
        <UserProfileCard
          pubkey={profileCard.pubkey}
          hubUrl={activeHub.hub_url}
          anchorRect={profileCard.rect}
          myPubkey={publicKey}
          isAdmin={isAdmin}
          myRoles={myRoles}
          onClose={() => setProfileCard(null)}
          onKick={(pk) => {
            invoke("kick_user_cmd", { hubUrl: activeHub.hub_url, pubkey: pk }).catch(() => {});
          }}
          onBan={(pk) => {
            invoke("ban_user_cmd", { hubUrl: activeHub.hub_url, pubkey: pk, reason: null }).catch(() => {});
          }}
          onMute={(pk) => {
            invoke("voice_mute_user_cmd", { hubUrl: activeHub.hub_url, pubkey: pk, reason: null }).catch(() => {});
          }}
        />
      )}

      {showPinned && activeHub && selectedChannel && (
        <PinnedMessages
          hubUrl={activeHub.hub_url}
          channelId={selectedChannel.id}
          channelName={selectedChannel.name}
          isAdmin={isAdmin}
          onClose={() => setShowPinned(false)}
          onScrollToMessage={onScrollToMessage}
        />
      )}

      {showPollComposer && activeHub && selectedChannel && (
        <PollComposer
          hubUrl={activeHub.hub_url}
          channelId={selectedChannel.id}
          onCreated={() => {
            setShowPollComposer(false);
            onToast("Poll created");
          }}
          onClose={() => setShowPollComposer(false)}
        />
      )}

      {showEventsPanel && activeHub && (
        <EventsPanel
          hubUrl={activeHub.hub_url}
          isAdmin={isAdmin}
          onClose={() => setShowEventsPanel(false)}
        />
      )}

    </>
  );
}
