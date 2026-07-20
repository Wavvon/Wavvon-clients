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
  LinkPreview,
  BotProfile,
  PostListResponse,
  PostDetail,
  UserProfile,
} from "../types";
import { UserListGrouped } from "@wavvon/ui";
import { UserProfileCard } from "@wavvon/ui";
import { PinnedMessages } from "./PinnedMessages";
import { DmView } from "./content/DmView";
import { ChannelMessageList } from "./content/ChannelMessageList";
import {
  AllianceView, BotCard, ReconnectBanner, ForumView, type ForumActions,
  PollComposer, EventsPanel, type Poll, type HubEvent,
  ChannelHeader, ChannelComposer, type MessageRowActions,
} from "@wavvon/ui";

function domainOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

// Desktop has no alliance-forum access yet (federation write-proxy is a
// web-only surface so far), so the alliance-prefixed actions stay unset.
// Reply-thread pagination (the old desktop forum_get_post_replies command)
// is dropped here -- the hub never registered a GET route for
// /channels/:cid/posts/:pid/replies, so that command 404'd already.
const forumActions: ForumActions = {
  listPosts: (channelId, cursor) => invoke<PostListResponse>("forum_list_posts", { channelId, cursor }),
  getPost: (channelId, postId) => invoke<PostDetail>("forum_get_post", { channelId, postId }),
  createPost: (channelId, title, body) => invoke<{ id: string }>("forum_create_post", { channelId, title, body }),
  createReply: (channelId, postId, body, replyToId) =>
    invoke<{ id: string }>("forum_create_reply", { channelId, postId, body, replyToId }),
  // ponytail: these 8 don't have a #[tauri::command] on the Rust side yet --
  // wired against the hub's real channel/post-scoped routes so backend-engineer
  // can add forum_edit_post/forum_delete_post/forum_edit_reply/forum_delete_reply/
  // forum_add_post_reaction/forum_remove_post_reaction/forum_add_reply_reaction/
  // forum_remove_reply_reaction by mirroring forum_pin_post's pattern.
  editPost: (channelId, postId, title, body) => invoke<void>("forum_edit_post", { channelId, postId, title, body }),
  deletePost: (channelId, postId) => invoke<void>("forum_delete_post", { channelId, postId }),
  editReply: (channelId, postId, replyId, body) =>
    invoke<void>("forum_edit_reply", { channelId, postId, replyId, body }),
  deleteReply: (channelId, postId, replyId) => invoke<void>("forum_delete_reply", { channelId, postId, replyId }),
  pinPost: (channelId, postId, pin) => invoke<void>("forum_pin_post", { channelId, postId, pin }),
  lockPost: (channelId, postId, lock) => invoke<void>("forum_lock_post", { channelId, postId, lock }),
  markPostRead: (channelId, postId) => invoke<void>("mark_post_read", { channelId, postId }),
  addPostReaction: (channelId, postId, emoji) =>
    invoke<void>("forum_add_post_reaction", { channelId, postId, emoji }),
  removePostReaction: (channelId, postId, emoji) =>
    invoke<void>("forum_remove_post_reaction", { channelId, postId, emoji }),
  addReplyReaction: (channelId, postId, replyId, emoji) =>
    invoke<void>("forum_add_reply_reaction", { channelId, postId, replyId, emoji }),
  removeReplyReaction: (channelId, postId, replyId, emoji) =>
    invoke<void>("forum_remove_reply_reaction", { channelId, postId, replyId, emoji }),
};

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
  channels: Channel[];
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
  view, activeHubId, hubs, theme, channels,
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
  const [profileCard, setProfileCard] = useState<{ pubkey: string } | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [showEventsPanel, setShowEventsPanel] = useState(false);
  // Track IME composition so we don't reset the input value mid-emoji on Windows.
  const isComposing = React.useRef(false);

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
      const raw = localStorage.getItem(`wavvon.threads.${selectedChannel.id}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>({});

  useEffect(() => {
    if (!selectedChannel) { setExpandedThreads(new Set()); return; }
    try {
      const raw = localStorage.getItem(`wavvon.threads.${selectedChannel.id}`);
      setExpandedThreads(new Set(raw ? JSON.parse(raw) : []));
    } catch { setExpandedThreads(new Set()); }
    setThreadReplies({});
  }, [selectedChannel?.id]);

  function persistExpandedThreads(next: Set<string>) {
    if (!selectedChannel) return;
    localStorage.setItem(`wavvon.threads.${selectedChannel.id}`, JSON.stringify([...next]));
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

  const openProfileCard = useCallback((pubkey: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setProfileCard({ pubkey });
  }, []);

  // Same member menu the sidebar member list opens on right-click — folded
  // in from web, a real feature desktop's message rows lacked (right-click
  // on a message author previously did nothing).
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

  async function fetchLinkPreviewAction(hubUrl: string, url: string): Promise<LinkPreview> {
    const raw = await invoke<{ url: string; title?: string; description?: string; image_url?: string }>(
      "fetch_link_preview", { hubUrl, url },
    );
    return {
      url: raw.url,
      title: raw.title ?? null,
      description: raw.description ?? null,
      image: raw.image_url ?? null,
      domain: domainOf(raw.url),
    };
  }

  const messageRowActions: MessageRowActions = {
    pinMessage: (channelId, messageId) => invoke("pin_message", { hubUrl: activeHub?.hub_url ?? "", channelId, messageId }),
    unpinMessage: (channelId, messageId) => invoke("unpin_message", { hubUrl: activeHub?.hub_url ?? "", channelId, messageId }),
    sendBotAppJoin: (botId, channelId) => {
      invoke("send_hub_ws_raw", {
        payload: JSON.stringify({ type: "bot_app_join", bot_id: botId, channel_id: channelId }),
      }).catch(() => {});
    },
    fetchLinkPreview: fetchLinkPreviewAction,
    muteUser: (pubkey) => invoke("mute_user_cmd", { targetPublicKey: pubkey, reason: null }),
    kickUser: (pubkey) => invoke("kick_user_cmd", { targetPublicKey: pubkey, reason: null }),
    banUser: (pubkey) => invoke("ban_user_cmd", { targetPublicKey: pubkey, reason: null }),
    // votePoll/deletePoll and reportMessage omitted — see MessageRowActions doc comment.
  };

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

  function fillMention(displayName: string) {
    if (mentionAnchor < 0 || !displayName) return;
    const before = inputText.slice(0, mentionAnchor);
    const after = inputText.slice(mentionAnchor + 1 + (inputText.slice(mentionAnchor + 1).split(" ")[0].length));
    onInputTextChange(`${before}@${displayName} ${after}`);
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
        const u = mentionSuggestions[mentionSelectedIdx];
        if (u?.display_name) fillMention(u.display_name);
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
            channelId={selectedChannel.id}
            myRoles={myRoles}
            myPubkey={publicKey}
            isAdmin={isAdmin}
            actions={forumActions}
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
              onShowPinned={() => setShowPinned(true)}
              onToggleSearch={() => searchOpen ? onCloseSearch() : onSetSearchOpen(true)}
              onCloseSearch={onCloseSearch}
              onSetSearchQuery={onSetSearchQuery}
              onToggleMemberSidebar={() => onSetMemberSidebarHidden(!memberSidebarHidden)}
              onOpenEditDescription={onOpenEditDescription}
              // Desktop's sidebar doesn't track collapsed-category state the
              // way web's does (ChannelSidebar collapse persistence), so the
              // breadcrumb renders but a crumb click is a no-op here for now.
              onBreadcrumbCategoryClick={() => {}}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px" }}>
              <button
                onClick={() => setShowEventsPanel(true)}
                className="btn-icon-header"
                title="Events"
                aria-label="Events"
              >
                📅
              </button>
            </div>
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
              onAuthorContextMenu={handleAuthorContextMenu}
              onMessagesScroll={onMessagesScroll}
              onJumpToBottom={onJumpToBottom}
              onClearFirstNotify={onClearFirstNotify}
              onMessageKeyDown={handleMessageKeyDown}
              onComponentInteract={handleComponentInteract}
              actions={messageRowActions}
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
              mentionQuery={mentionAnchor >= 0 ? inputText.slice(mentionAnchor + 1) : null}
              showPollButton={!!(selectedChannel && activeHub)}
              isComposing={isComposing}
              messageInputRef={messageInputRef}
              loadHubEmojis={() => invoke("list_hub_emojis")}
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
            myPubkey={publicKey}
            onUserClick={(pubkey) => openProfileCard(pubkey)}
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
          anchorRect={botCard.rect}
          onClose={() => setBotCard(null)}
          loadBotProfile={(pk) => invoke<BotProfile>("get_bot_profile", { hubUrl: activeHub.hub_url, pubkey: pk })}
        />
      )}

      {profileCard && activeHub && (
        <UserProfileCard
          pubkey={profileCard.pubkey}
          myPubkey={publicKey}
          activeHubId={activeHubId}
          actions={{ getUserProfile: (pubkey) => invoke<UserProfile>("get_user_profile", { hubUrl: activeHub.hub_url, pubkey }) }}
          onClose={() => setProfileCard(null)}
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
          channelId={selectedChannel.id}
          onCreatePoll={async (channelId, question, options) => {
            const raw = await invoke<{
              id: string; channel_id: string; creator_pubkey: string; question: string;
              options: string; ends_at: number | null; created_at: number;
            }>("create_poll", { hubUrl: activeHub.hub_url, channelId, question, options, closesAt: null });
            const rawOptions: Array<{ id: string; text: string }> = JSON.parse(raw.options);
            const poll: Poll = {
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
            return poll;
          }}
          onCreated={() => {
            setShowPollComposer(false);
            onToast("Poll created");
          }}
          onClose={() => setShowPollComposer(false)}
        />
      )}

      {showEventsPanel && activeHub && (
        <div className="modal-overlay" onClick={() => setShowEventsPanel(false)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setShowEventsPanel(false)} aria-label="Close">✕</button>
            </div>
            <EventsPanel
              channelId={selectedChannel?.id ?? ""}
              myPubkey={publicKey}
              isAdmin={isAdmin}
              channels={channels}
              getEvents={() => invoke<HubEvent[]>("get_hub_events", { hubUrl: activeHub.hub_url })}
              deleteEvent={(eventId) => invoke<void>("delete_event", { hubUrl: activeHub.hub_url, eventId })}
              rsvpEvent={(eventId, status) => invoke<void>("rsvp_event_hub", { hubUrl: activeHub.hub_url, eventId, status })}
              createEvent={(payload) =>
                invoke<HubEvent>("create_event_hub", {
                  hubUrl: activeHub.hub_url,
                  title: payload.title,
                  description: payload.description ?? "",
                  startsAt: payload.starts_at,
                  endsAt: payload.ends_at ?? null,
                  channelId: payload.channel_id,
                  location: payload.location ?? null,
                })
              }
            />
          </div>
        </div>
      )}

    </>
  );
}
