import React, { useState, useCallback, useRef, useEffect } from "react";
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
  ActiveStream,
  InstalledGame,
  PostSummary,
} from "../types";
import { GamePicker } from "./GamePicker";
import { GameModal } from "./GameModal";
import { GamepadIcon } from "./Icons";
import { ForumPostList } from "./ForumPostList";
import { ForumPostDetail } from "./ForumPostDetail";
import { ForumComposer } from "./ForumComposer";
import { MessageEmbeds } from "./MessageEmbeds";
import { MessageComponents } from "./MessageComponents";
import { ScreenShareViewer } from "./ScreenShareViewer";
import type { ScreenShareViewerRef } from "./ScreenShareViewer";
import {
  formatPubkey,
  meAction,
  mentionsName,
  colorForKey,
  dayKey,
  formatDayLabel,
  formatFullTimestamp,
  formatRelative,
} from "../utils/format";
import { Avatar } from "./Avatar";
import { TypingIndicator } from "./TypingIndicator";
import { MessageReactions } from "./MessageReactions";
import { ReactionPicker } from "./ReactionPicker";
import { PendingAttachments, MessageAttachments } from "./Attachments";
import { MessageContent } from "./MessageContent";
import { UserListGrouped } from "./UserListGrouped";
import { BotCard } from "./BotCard";

interface SelectedAllianceChannel {
  alliance_id: string;
  alliance_name: string;
  channel: AllianceSharedChannel;
}

function IgnoredMessagePlaceholder() {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <li className="message message-row message-ignored-placeholder">
      {revealed ? null : (
        <button
          className="btn-link muted"
          style={{ fontSize: "var(--text-xs)" }}
          onClick={() => setRevealed(true)}
        >
          Message from ignored user — click to reveal
        </button>
      )}
    </li>
  );
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
  installedGames: InstalledGame[];
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
  activeScreenShares: ActiveStream[];
  screenShareViewerRef: React.RefObject<ScreenShareViewerRef | null>;
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
  installedGames, myAvatar,
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
  sharing, shareKbps, onStopShare,
  onComponentInteract,
  assertiveAnnouncement = "",
}: Props) {
  const { t } = useTranslation();
  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommandEntry[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [botCard, setBotCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeGame, setActiveGame] = useState<InstalledGame | null>(null);
  const [pendingGameForSession, setPendingGameForSession] = useState<InstalledGame | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [activeSessions, setActiveSessions] = useState<{ id: string; host_pubkey: string; players: string[] }[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [forumSelectedPost, setForumSelectedPost] = useState<PostSummary | null>(null);
  const [forumComposing, setForumComposing] = useState(false);
  const [groupDmAcknowledged, setGroupDmAcknowledged] = useState(false);

  useEffect(() => {
    setForumSelectedPost(null);
    setForumComposing(false);
  }, [selectedChannel?.id]);
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number>(-1);
  const messageRowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnnouncementsRef = useRef<string[]>([]);

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
    } else {
      setSlashSuggestions([]);
    }
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
          <div className="reconnect-banner">
            <span>{reconnectingHubs[activeHubId] ? t("reconnect.reconnecting") : t("reconnect.disconnected")}</span>
            <button
              className="btn-small"
              onClick={onReconnect}
              disabled={!!reconnectingHubs[activeHubId]}
            >
              {reconnectingHubs[activeHubId] ? t("reconnect.working") : t("reconnect.button")}
            </button>
          </div>
        )}

        {view === "dms" ? (
          selectedConversation ? (
            <>
              {view === "dms" && selectedConversation.conv_type === "group" && !groupDmAcknowledged ? (
                <div className="dm-group-ack-overlay">
                  <div className="dm-group-ack-box">
                    <p className="dm-group-ack-title">Group messages are not encrypted</p>
                    <p className="dm-group-ack-body">
                      {t("dm.group_banner")}
                      {" "}{t("dm.group_banner_detail")}
                    </p>
                    <button
                      className="btn-primary"
                      onClick={() => setGroupDmAcknowledged(true)}
                    >
                      {t("dm.group_banner_got_it")}
                    </button>
                  </div>
                </div>
              ) : (
              <>
              <div className="channel-header">
                <h3>
                  @{" "}
                  {selectedConversation.members
                    .filter((m) => m !== publicKey)
                    .map((k) => {
                      const u = users.find((u) => u.public_key === k);
                      return u?.display_name || k.slice(0, 12);
                    })
                    .join(", ")}
                </h3>
              </div>
              {selectedConversation.conv_type === "group" && (
                <div className="dm-group-banner">
                  {t("dm.group_banner")}
                </div>
              )}
              <div className="messages">
                {(dmMessages[selectedConversation.id] || [])
                  .filter((m) => !blockedUsers.has(m.sender))
                  .map((m, i) => {
                    const senderLabel =
                      users.find((u) => u.public_key === m.sender)?.display_name ||
                      m.sender_name ||
                      formatPubkey(m.sender);
                    const showFailed = m.delivery_failed === true && m.sender === publicKey;
                    const failedBadge = showFailed ? (
                      <span
                        className="dm-delivery-failed"
                        title="The sender's hub couldn't deliver this to one or more recipients after retries."
                      >
                        {t("dm.delivery_failed")}
                      </span>
                    ) : null;
                    const lockIcon = m.is_encrypted
                      ? <span className="dm-lock-icon" title={t("dm.encrypted")}>🔒</span>
                      : null;
                    const actionText = meAction(m.content);
                    if (actionText !== null) {
                      return (
                        <div key={i} className="message message-action">
                          <span className="action-asterisk">*</span>
                          <span className="message-sender" style={{ color: colorForKey(m.sender) }}>
                            {senderLabel}
                          </span>
                          <span className="action-text">
                            <MessageContent content={actionText} knownNames={knownDisplayNames} myName={myDisplayName} />
                          </span>
                          <span className="message-time" title={formatFullTimestamp(m.timestamp)}>
                            {formatRelative(m.timestamp)}
                          </span>
                          {lockIcon}
                          {failedBadge}
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="message">
                        <span className="message-sender" style={{ color: colorForKey(m.sender) }}>
                          {senderLabel}
                        </span>
                        <span className="message-time" title={formatFullTimestamp(m.timestamp)}>
                          {formatRelative(m.timestamp)}
                        </span>
                        {lockIcon}
                        <span className="message-content">
                          <MessageContent content={m.content} knownNames={knownDisplayNames} myName={myDisplayName} />
                        </span>
                        {m.attachments && m.attachments.length > 0 && (
                          <MessageAttachments items={m.attachments} onImageClick={onOpenImage} />
                        )}
                        {failedBadge}
                      </div>
                    );
                  })}
                <div ref={messagesEndRef} />
              </div>
              <TypingIndicator typers={Object.values(dmTypingByKey)} />
              {pendingAttachments.length > 0 && (
                <PendingAttachments
                  items={pendingAttachments}
                  onRemove={(i) => onSetPendingAttachments(pendingAttachments.filter((_, idx) => idx !== i))}
                />
              )}
              <div
                className="input-area"
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) onAttachFiles(e.dataTransfer.files); }}
              >
                <label className="btn-attach" title={t("composer.attach")}>
                  📎
                  <input
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => { onAttachFiles(e.target.files); (e.target as HTMLInputElement).value = ""; }}
                  />
                </label>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => { onInputTextChange(e.target.value); if (e.target.value.length > 0) onPingDmTyping(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendDm(); }
                  }}
                  placeholder={t("composer.send")}
                />
                <button onClick={onSendDm}>{t("composer.send")}</button>
              </div>
            </>
              )}
            </>
          ) : (
            <div className="no-channel"><p>{t("dm.no_selection")}</p></div>
          )
        ) : selectedChannel && selectedChannel.channel_type === "forum" ? (
          <div className="forum-area">
            {forumComposing ? (
              <ForumComposer
                channelId={selectedChannel.id}
                activeHubUrl={activeHub?.hub_url ?? ""}
                onCreated={(post) => { setForumComposing(false); setForumSelectedPost(post); }}
                onCancel={() => setForumComposing(false)}
              />
            ) : forumSelectedPost ? (
              <ForumPostDetail
                postSummary={forumSelectedPost}
                channelId={selectedChannel.id}
                activeHubUrl={activeHub?.hub_url ?? ""}
                users={users}
                myPubkey={publicKey}
                myRoles={myRoles}
                onBack={() => setForumSelectedPost(null)}
                onPostUpdated={(updated) => setForumSelectedPost(updated)}
              />
            ) : (
              <ForumPostList
                channel={selectedChannel}
                users={users}
                myRoles={myRoles}
                activeHubUrl={activeHub?.hub_url ?? ""}
                onSelectPost={(post) => setForumSelectedPost(post)}
                onNewPost={() => setForumComposing(true)}
              />
            )}
          </div>
        ) : selectedChannel ? (
          <>
            <div className="channel-header">
              <div className="channel-header-info">
                <h3># {selectedChannel.name}</h3>
                {selectedChannel.description ? (
                  <p
                    className={`channel-description ${isAdmin ? "editable" : ""}`}
                    onClick={() => { if (isAdmin) onOpenEditDescription(selectedChannel); }}
                    title={isAdmin ? t("channel.description.click_edit") : undefined}
                  >
                    {selectedChannel.description}
                  </p>
                ) : isAdmin ? (
                  <p
                    className="channel-description editable muted"
                    onClick={() => onOpenEditDescription(selectedChannel)}
                    title={t("channel.description.click_add")}
                  >
                    {t("channel.add_description")}
                  </p>
                ) : null}
              </div>
              {!selectedChannel.is_category && (
                voiceChannelId === selectedChannel.id ? (
                  <button
                    onClick={onVoiceLeave}
                    className="btn-voice-header btn-voice-leave"
                    title={t("voice.leave")}
                  >
                    🔴 {t("voice.leave.header")}
                  </button>
                ) : (
                  <button
                    onClick={onVoiceJoin}
                    className="btn-voice-header btn-voice-join"
                    title={t("voice.join")}
                  >
                    🎙 {t("voice.join.header")}
                  </button>
                )
              )}
              {installedGames.length > 0 && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="btn-icon-header"
                  title={t("content.activities")}
                >
                  <GamepadIcon size={16} />
                </button>
              )}
              <button
                onClick={() => searchOpen ? onCloseSearch() : onSetSearchOpen(true)}
                className="btn-icon-header"
                title={t("content.search.title")}
              >
                🔍
              </button>
              <button
                onClick={() => onSetMemberSidebarHidden(!memberSidebarHidden)}
                className="btn-icon-header"
                title={memberSidebarHidden ? t("content.members.show") : t("content.members.hide")}
              >
                {memberSidebarHidden ? "👥" : "👤"}
              </button>
            </div>
            {searchOpen && (
              <div className="search-bar">
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => onSetSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") onCloseSearch(); }}
                  placeholder={t("channel.search.placeholder", { channel: selectedChannel.name })}
                />
                {searchResults !== null && (
                  <span className="muted search-count">
                    {t("channel.search.count", { count: searchResults.length })}
                  </span>
                )}
                <button onClick={onCloseSearch} className="btn-small">{t("channel.search.close")}</button>
              </div>
            )}
            {activeScreenShares.length > 0 && (
              <ScreenShareViewer
                ref={screenShareViewerRef}
                streams={activeScreenShares}
              />
            )}
            {sharing && (
              <div className="screen-share-active-bar">
                <span>{t("voice.sharing")}</span>
                {shareKbps > 0 && (
                  <span className="muted">{shareKbps} kbps</span>
                )}
                <button className="stop-btn" onClick={onStopShare}>
                  {t("voice.screen_share.stop")}
                </button>
              </div>
            )}
            <ol aria-label={t("message.actions.aria")} className="messages" ref={messagesContainerRef} onScroll={onMessagesScroll}>
              {(searchResults ?? messages).length === 0 && (
                <li className="channel-empty">
                  {searchResults !== null ? (
                    <p>{t("channel.empty.no_search")}</p>
                  ) : (
                    <>
                      <div className="channel-empty-icon">👋</div>
                      <h2>{t("channel.empty.welcome", { channel: selectedChannel.name })}</h2>
                      <p>
                        {selectedChannel.description
                          ? selectedChannel.description
                          : "This is the start of the channel — say hello!"}
                      </p>
                      <ul className="channel-empty-tips">
                        <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_voice") }} />
                        <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_drag") }} />
                        <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_mentions") }} />
                        <li dangerouslySetInnerHTML={{ __html: t("channel.empty.tip_jump") }} />
                      </ul>
                    </>
                  )}
                </li>
              )}
              {(searchResults ?? messages)
                .filter((m) => !blockedUsers.has(m.sender))
                .map((m, i, arr) => {
                  const isIgnored = ignoredUsers.has(m.sender) && m.sender !== publicKey;
                  if (isIgnored) {
                    return (
                      <IgnoredMessagePlaceholder key={m.id} />
                    );
                  }
                  const showSeparator = i === 0 || dayKey(m.created_at) !== dayKey(arr[i - 1].created_at);
                  const isMine = m.sender === publicKey;
                  const canDelete =
                    isMine ||
                    myRoles.some((r) => r.permissions.some((p) => p === "admin" || p === "manage_messages"));
                  const isEditing = editingMessageId === m.id;
                  const senderUser = users.find((u) => u.public_key === m.sender);
                  const senderLabel = senderUser?.display_name || m.sender_name || formatPubkey(m.sender);
                  const isMentioned = m.sender !== publicKey && mentionsName(m.content, myDisplayName);
                  const isEphemeral = !!m.visible_to_pubkey && m.visible_to_pubkey === publicKey;
                  const actionText = meAction(m.content);
                  const displayedMessages = (searchResults ?? messages).filter((msg) => !blockedUsers.has(msg.sender));

                  const msgAriaLabelParts = [`${senderLabel} at ${formatRelative(m.created_at)}: ${m.content}`];
                  if (m.reply_to) msgAriaLabelParts.push(`${t("message.action.reply")} ${m.reply_to.sender_name || formatPubkey(m.reply_to.sender)}.`);
                  if (m.reactions && m.reactions.length > 0) {
                    const total = m.reactions.reduce((n, r) => n + r.count, 0);
                    msgAriaLabelParts.push(`${total} ${total === 1 ? "reaction" : "reactions"}: ${m.reactions.map(r => r.emoji).join(", ")}.`);
                  }
                  if (m.attachments && m.attachments.length > 0) {
                    msgAriaLabelParts.push(`${m.attachments.length} ${m.attachments.length === 1 ? "attachment" : "attachments"}: ${m.attachments.map(a => a.name).join(", ")}.`);
                  }
                  const msgAriaLabel = msgAriaLabelParts.join(" ");

                  if (actionText !== null) {
                    return (
                      <React.Fragment key={m.id}>
                        {showSeparator && (
                          <li className="day-separator" aria-hidden="true">
                            <span className="day-separator-label">{formatDayLabel(m.created_at)}</span>
                          </li>
                        )}
                        <li
                          ref={(el) => { messageRowRefs.current[i] = el; }}
                          id={`msg-${m.id}`}
                          tabIndex={focusedMessageIndex === i ? 0 : -1}
                          onKeyDown={(e) => handleMessageKeyDown(e, i, displayedMessages)}
                          aria-label={msgAriaLabel}
                          className={`message message-action message-row ${isMentioned ? "message-mentioned" : ""} ${isEphemeral ? "message-ephemeral" : ""}`}
                        >
                          <span className="action-asterisk" aria-hidden="true">*</span>
                          <span className="message-sender" style={{ color: colorForKey(m.sender) }}>
                            {senderLabel}
                          </span>
                          <span className="action-text">
                            <MessageContent content={actionText} knownNames={knownDisplayNames} myName={myDisplayName} />
                          </span>
                          {isEphemeral && (
                            <div className="message-ephemeral-label">{t("message.ephemeral")}</div>
                          )}
                        </li>
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={m.id}>
                      {showSeparator && (
                        <li className="day-separator" aria-hidden="true">
                          <span className="day-separator-label">{formatDayLabel(m.created_at)}</span>
                        </li>
                      )}
                      <li
                        ref={(el) => { messageRowRefs.current[i] = el; }}
                        id={`msg-${m.id}`}
                        tabIndex={focusedMessageIndex === i ? 0 : -1}
                        onKeyDown={(e) => handleMessageKeyDown(e, i, displayedMessages)}
                        aria-label={msgAriaLabel}
                        className={`message message-row ${isMentioned ? "message-mentioned" : ""} ${isEphemeral ? "message-ephemeral" : ""}`}
                      >
                        {m.reply_to && (
                          <div
                            className="message-reply-preview"
                            onClick={() => m.reply_to && onScrollToMessage(m.reply_to.message_id)}
                            title={t("message.reply.jump")}
                          >
                            <span className="reply-arrow" aria-hidden="true">↪</span>
                            <span className="reply-author">
                              {m.reply_to.sender_name || formatPubkey(m.reply_to.sender)}
                            </span>
                            <span className="reply-snippet">{m.reply_to.content_preview}</span>
                          </div>
                        )}
                        <span
                          style={{ cursor: senderUser?.is_bot ? "pointer" : undefined }}
                          onClick={senderUser?.is_bot && !senderUser?.is_webhook ? (e) => openBotCard(m.sender, e) : undefined}
                        >
                          <Avatar src={senderUser?.avatar} name={senderLabel} size={28} />
                        </span>
                        <span
                          className="message-sender"
                          style={{ color: colorForKey(m.sender), cursor: senderUser?.is_bot ? "pointer" : undefined }}
                          onClick={senderUser?.is_bot && !senderUser?.is_webhook ? (e) => openBotCard(m.sender, e) : undefined}
                        >
                          {senderLabel}
                        </span>
                        {senderUser?.is_bot && !senderUser?.is_webhook && (
                          <span className="bot-badge" aria-hidden="true">{t("bot.badge")}</span>
                        )}
                        {senderUser?.is_webhook && (
                          <span className="bot-badge bot-badge--app" aria-hidden="true">{t("app.badge")}</span>
                        )}
                        {isEditing ? (
                          <span className="message-edit">
                            <input
                              type="text"
                              value={editingDraft}
                              onChange={(e) => onSetEditingDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") onSaveEdit();
                                if (e.key === "Escape") onCancelEdit();
                              }}
                              autoFocus
                            />
                            <button onClick={onSaveEdit} className="btn-small">{t("message.edit.save")}</button>
                            <button onClick={onCancelEdit} className="btn-small btn-secondary-small">{t("message.edit.cancel")}</button>
                          </span>
                        ) : (
                          <>
                            <span className="message-time" title={formatFullTimestamp(m.created_at)}>
                              {formatRelative(m.created_at)}
                            </span>
                            <span className="message-content">
                              <MessageContent content={m.content} knownNames={knownDisplayNames} myName={myDisplayName} />
                            </span>
                            {m.attachments && m.attachments.length > 0 && (
                              <MessageAttachments items={m.attachments} onImageClick={onOpenImage} />
                            )}
                            {m.edited_at && (
                              <span
                                className="message-edited-tag"
                                title={`Edited ${formatFullTimestamp(m.edited_at)}`}
                              >
                                {t("message.edited")}
                              </span>
                            )}
                            <div role="toolbar" aria-label={t("message.actions.aria")} className="message-actions">
                              <ReactionPicker onPick={(emoji) => onToggleReaction(m.id, emoji)} />
                              <button className="message-action" onClick={() => onSetReplyTarget(m)} title={t("message.action.reply")} aria-label={t("message.action.reply")}>
                                ↩
                              </button>
                              <button
                                className="message-action"
                                onClick={async () => {
                                  const hub = hubs.find((h) => h.hub_id === activeHubId);
                                  if (!hub) return;
                                  const link = `voxply://${hub.hub_url.replace(/^https?:\/\//, "")}/channel/${m.channel_id}/message/${m.id}`;
                                  try {
                                    await navigator.clipboard.writeText(link);
                                    onToast(t("message.action.link_copied"));
                                  } catch (e) {
                                    onError(String(e));
                                  }
                                }}
                                title={t("message.action.copy_link")}
                                aria-label={t("message.action.copy_link")}
                              >
                                🔗
                              </button>
                              {isMine && (
                                <button className="message-action" onClick={() => onStartEdit(m)} title={t("message.action.edit")} aria-label={t("message.action.edit")}>
                                  ✎
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="message-action danger"
                                  onClick={() => onDeleteMessage(m.id)}
                                  title={t("message.action.delete")}
                                  aria-label={t("message.action.delete")}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            {m.reactions && m.reactions.length > 0 && (
                              <MessageReactions
                                reactions={m.reactions}
                                onToggle={(emoji) => onToggleReaction(m.id, emoji)}
                              />
                            )}
                            {m.embeds && m.embeds.length > 0 && (
                              <MessageEmbeds embeds={m.embeds} />
                            )}
                            {m.components && m.components.length > 0 && (
                              <MessageComponents
                                rows={m.components}
                                messageId={m.id}
                                hubUrl={activeHub?.hub_url ?? ""}
                                onInteract={handleComponentInteract}
                              />
                            )}
                            {isEphemeral && (
                              <div className="message-ephemeral-label">{t("message.ephemeral")}</div>
                            )}
                          </>
                        )}
                      </li>
                    </React.Fragment>
                  );
                })}
              <li ref={messagesEndChannelRef} aria-hidden="true" />
            </ol>
            {firstNotifyingMessageId &&
              messages.some((m) => m.id === firstNotifyingMessageId) && (
              <button
                className="jump-to-bottom jump-to-notification"
                onClick={() => {
                  onScrollToMessage(firstNotifyingMessageId);
                  onClearFirstNotify();
                }}
              >
                {t("message.jump.first_notification")}
              </button>
            )}
            {!stickToBottom && newWhileScrolledUp > 0 && (
              <button className="jump-to-bottom" onClick={onJumpToBottom}>
                {t("message.jump.bottom", { count: newWhileScrolledUp })}
              </button>
            )}
            <TypingIndicator typers={Object.values(typingByKey)} />
            {replyTarget && (
              <div className="reply-banner">
                <span className="muted">{t("composer.reply_banner.replying_to")} </span>
                <strong>
                  {users.find((u) => u.public_key === replyTarget.sender)?.display_name ||
                    replyTarget.sender_name ||
                    formatPubkey(replyTarget.sender)}
                </strong>
                <span className="reply-snippet">{replyTarget.content.slice(0, 80)}</span>
                <button className="reply-banner-close" onClick={() => onSetReplyTarget(null)} title={t("composer.reply_banner.cancel")}>
                  ×
                </button>
              </div>
            )}
            {pendingAttachments.length > 0 && (
              <PendingAttachments
                items={pendingAttachments}
                onRemove={(i) => onSetPendingAttachments(pendingAttachments.filter((_, idx) => idx !== i))}
              />
            )}
            <form
              aria-label={t("composer.form.aria")}
              className="input-area"
              onSubmit={(e) => { e.preventDefault(); onSend(); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) onAttachFiles(e.dataTransfer.files); }}
            >
              <label className="btn-attach" title={t("composer.attach")}>
                📎
                <input
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => { onAttachFiles(e.target.files); (e.target as HTMLInputElement).value = ""; }}
                />
              </label>
              <div style={{ position: "relative", flex: 1 }}>
                {slashSuggestions.length > 0 && (
                  <div className="slash-command-popup">
                    {slashSuggestions.map((s, i) => (
                      <div
                        key={s.command}
                        className={`slash-command-item${i === slashSelectedIdx ? " selected" : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); fillSlashCommand(s.command); }}
                      >
                        <span className="slash-command-name">/{s.command}</span>
                        <span className="slash-command-desc">{s.description}</span>
                        <span className="slash-command-bot">{s.bot_name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={messageInputRef}
                  type="text"
                  value={inputText}
                  style={{ width: "100%" }}
                  onChange={(e) => { handleSlashInputChange(e.target.value); if (e.target.value.length > 0) onPingTyping(); }}
                  onKeyDown={handleSlashKeyDown}
                  placeholder={
                    replyTarget
                      ? t("composer.placeholder.reply", { name: users.find((u) => u.public_key === replyTarget.sender)?.display_name ?? "user" })
                      : t("composer.placeholder", { channel: selectedChannel.name })
                  }
                />
              </div>
              <button type="submit" aria-label={t("composer.send.aria")}>{t("composer.send")}</button>
            </form>
          </>
        ) : selectedAllianceChannel ? (
          <>
            <div className="channel-header">
              <div className="channel-header-info">
                <h3># {selectedAllianceChannel.channel.channel_name}</h3>
                <p className="channel-description">
                  🤝 {selectedAllianceChannel.alliance_name} · hosted on{" "}
                  {selectedAllianceChannel.channel.hub_name}
                </p>
              </div>
            </div>
            <div className="messages">
              {allianceMessages.map((m) => {
                const senderLabel = m.sender_name || formatPubkey(m.sender);
                return (
                  <div key={m.id} className="message">
                    <Avatar src={null} name={senderLabel} size={28} />
                    <span className="message-sender" style={{ color: colorForKey(m.sender) }}>
                      {senderLabel}
                    </span>
                    <span className="message-content">
                      <MessageContent content={m.content} knownNames={knownDisplayNames} myName={myDisplayName} />
                    </span>
                    {m.attachments && m.attachments.length > 0 && (
                      <MessageAttachments items={m.attachments} onImageClick={onOpenImage} />
                    )}
                    <span className="message-time" title={formatFullTimestamp(m.created_at)}>
                      {formatRelative(m.created_at)}
                    </span>
                  </div>
                );
              })}
              {allianceMessages.length === 0 && (
                <p className="muted" style={{ padding: "1rem" }}>
                  No messages yet in this alliance channel.
                </p>
              )}
            </div>
            <div className="input-area">
              <input
                type="text"
                value={inputText}
                onChange={(e) => onInputTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendAllianceMessage(); }
                }}
                placeholder={`Message ${selectedAllianceChannel.channel.hub_name} · #${selectedAllianceChannel.channel.channel_name}`}
              />
              <button onClick={onSendAllianceMessage}>{t("composer.send")}</button>
            </div>
          </>
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

      {pickerOpen && (
        <GamePicker
          games={installedGames}
          onSelect={(game) => {
            setPickerOpen(false);
            const isMultiplayer = (game.permissions ?? []).includes("multiplayer");
            if (isMultiplayer) {
              invoke<{ id: string; host_pubkey: string; players: string[] }[]>("list_game_sessions", { gameId: game.id, channelId: selectedChannel?.id }).then((sessions) => {
                setActiveSessions(sessions);
                setPendingGameForSession(game);
                setSessionPickerOpen(true);
              }).catch(() => {
                setActiveGame(game);
                setActiveSessionId(null);
              });
            } else {
              setActiveGame(game);
              setActiveSessionId(null);
            }
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {sessionPickerOpen && pendingGameForSession && (
        <div className="game-modal-overlay" onClick={() => { setSessionPickerOpen(false); setPendingGameForSession(null); }}>
          <div className="game-session-picker" onClick={(e) => e.stopPropagation()}>
            <h3>{pendingGameForSession.name} — Session</h3>
            <button onClick={() => {
              setSessionPickerOpen(false);
              setActiveGame(pendingGameForSession);
              setActiveSessionId(null);
              setPendingGameForSession(null);
            }}>
              Create new session
            </button>
            {activeSessions.length > 0 && (
              <>
                <p className="muted" style={{ marginTop: 8 }}>Or join an existing session:</p>
                {activeSessions.map((s) => (
                  <button key={s.id} className="btn-secondary" onClick={() => {
                    setSessionPickerOpen(false);
                    setActiveGame(pendingGameForSession);
                    setActiveSessionId(s.id);
                    setPendingGameForSession(null);
                  }}>
                    Session by {s.host_pubkey.slice(0, 12)} ({s.players.length} players)
                  </button>
                ))}
              </>
            )}
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => { setSessionPickerOpen(false); setPendingGameForSession(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeGame && (
        <GameModal
          game={activeGame}
          theme={theme}
          publicKey={publicKey}
          displayName={myDisplayName}
          avatar={myAvatar}
          channelId={selectedChannel?.id ?? null}
          channelName={selectedChannel?.name ?? null}
          hubName={hubs.find((h) => h.hub_id === activeHubId)?.hub_name ?? null}
          hubPubkey={null}
          sessionId={activeSessionId}
          onClose={() => { setActiveGame(null); setActiveSessionId(null); }}
        />
      )}
    </>
  );
}
