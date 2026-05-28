import React, { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "../types";
import { GamePicker } from "./GamePicker";
import { GameModal } from "./GameModal";
import { GamepadIcon } from "./Icons";
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
  users, publicKey, blockedUsers, knownDisplayNames, myDisplayName,
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
  const [slashSuggestions, setSlashSuggestions] = useState<SlashCommandEntry[]>([]);
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const [botCard, setBotCard] = useState<{ pubkey: string; rect: DOMRect } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeGame, setActiveGame] = useState<InstalledGame | null>(null);
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
        setLiveAnnouncement(`${batch.length} new messages`);
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
            <span>{reconnectingHubs[activeHubId] ? "Reconnecting…" : "Disconnected from hub."}</span>
            <button
              className="btn-small"
              onClick={onReconnect}
              disabled={!!reconnectingHubs[activeHubId]}
            >
              {reconnectingHubs[activeHubId] ? "Working…" : "Reconnect"}
            </button>
          </div>
        )}

        {view === "dms" ? (
          selectedConversation ? (
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
                  Group DMs are not end-to-end encrypted yet.
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
                        ⚠ Delivery failed
                      </span>
                    ) : null;
                    const lockIcon = m.is_encrypted
                      ? <span className="dm-lock-icon" title="End-to-end encrypted">🔒</span>
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
                <label className="btn-attach" title="Attach file">
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
                  placeholder="Send a message..."
                />
                <button onClick={onSendDm}>Send</button>
              </div>
            </>
          ) : (
            <div className="no-channel"><p>Select a conversation</p></div>
          )
        ) : selectedChannel ? (
          <>
            <div className="channel-header">
              <div className="channel-header-info">
                <h3># {selectedChannel.name}</h3>
                {selectedChannel.description ? (
                  <p
                    className={`channel-description ${isAdmin ? "editable" : ""}`}
                    onClick={() => { if (isAdmin) onOpenEditDescription(selectedChannel); }}
                    title={isAdmin ? "Click to edit" : undefined}
                  >
                    {selectedChannel.description}
                  </p>
                ) : isAdmin ? (
                  <p
                    className="channel-description editable muted"
                    onClick={() => onOpenEditDescription(selectedChannel)}
                    title="Click to add a description"
                  >
                    Add a description…
                  </p>
                ) : null}
              </div>
              {!selectedChannel.is_category && (
                voiceChannelId === selectedChannel.id ? (
                  <button
                    onClick={onVoiceLeave}
                    className="btn-voice-header btn-voice-leave"
                    title="Leave voice"
                  >
                    🔴 Leave Voice
                  </button>
                ) : (
                  <button
                    onClick={onVoiceJoin}
                    className="btn-voice-header btn-voice-join"
                    title="Join voice in this channel"
                  >
                    🎙 Join Voice
                  </button>
                )
              )}
              {installedGames.length > 0 && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="btn-icon-header"
                  title="Activities"
                >
                  <GamepadIcon size={16} />
                </button>
              )}
              <button
                onClick={() => searchOpen ? onCloseSearch() : onSetSearchOpen(true)}
                className="btn-icon-header"
                title="Search messages"
              >
                🔍
              </button>
              <button
                onClick={() => onSetMemberSidebarHidden(!memberSidebarHidden)}
                className="btn-icon-header"
                title={memberSidebarHidden ? "Show member list" : "Hide member list"}
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
                  placeholder={`Search in #${selectedChannel.name}…`}
                />
                {searchResults !== null && (
                  <span className="muted search-count">
                    {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
                  </span>
                )}
                <button onClick={onCloseSearch} className="btn-small">Close</button>
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
                <span>You're sharing</span>
                {shareKbps > 0 && (
                  <span className="muted">{shareKbps} kbps</span>
                )}
                <button className="stop-btn" onClick={onStopShare}>
                  Stop sharing
                </button>
              </div>
            )}
            <ol aria-label="Messages" className="messages" ref={messagesContainerRef} onScroll={onMessagesScroll}>
              {(searchResults ?? messages).length === 0 && (
                <li className="channel-empty">
                  {searchResults !== null ? (
                    <p>No messages match your search.</p>
                  ) : (
                    <>
                      <div className="channel-empty-icon">👋</div>
                      <h2>Welcome to #{selectedChannel.name}</h2>
                      <p>
                        {selectedChannel.description
                          ? selectedChannel.description
                          : "This is the start of the channel — say hello!"}
                      </p>
                      <ul className="channel-empty-tips">
                        <li>Click <strong>Join Voice</strong> in the header to start a voice session here — or double-click any channel in the sidebar.</li>
                        <li><strong>Drag a file</strong> into the message area to share it (up to 3 MB).</li>
                        <li>
                          Type <code>@name</code> to mention someone,{" "}
                          <code>/me</code> for an action, or paste a code block with <code>```</code>.
                        </li>
                        <li>Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to jump to another channel from anywhere.</li>
                      </ul>
                    </>
                  )}
                </li>
              )}
              {(searchResults ?? messages)
                .filter((m) => !blockedUsers.has(m.sender))
                .map((m, i, arr) => {
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
                  if (m.reply_to) msgAriaLabelParts.push(`Reply to ${m.reply_to.sender_name || formatPubkey(m.reply_to.sender)}.`);
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
                            <div className="message-ephemeral-label">Only you can see this</div>
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
                            title="Jump to original"
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
                          <span className="bot-badge" aria-hidden="true">BOT</span>
                        )}
                        {senderUser?.is_webhook && (
                          <span className="bot-badge bot-badge--app" aria-hidden="true">APP</span>
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
                            <button onClick={onSaveEdit} className="btn-small">Save</button>
                            <button onClick={onCancelEdit} className="btn-small btn-secondary-small">Cancel</button>
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
                                (edited)
                              </span>
                            )}
                            <div role="toolbar" aria-label="Message actions" className="message-actions">
                              <ReactionPicker onPick={(emoji) => onToggleReaction(m.id, emoji)} />
                              <button className="message-action" onClick={() => onSetReplyTarget(m)} title="Reply" aria-label="Reply">
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
                                    onToast("Link copied");
                                  } catch (e) {
                                    onError(String(e));
                                  }
                                }}
                                title="Copy link"
                                aria-label="Copy link"
                              >
                                🔗
                              </button>
                              {isMine && (
                                <button className="message-action" onClick={() => onStartEdit(m)} title="Edit" aria-label="Edit message">
                                  ✎
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="message-action danger"
                                  onClick={() => onDeleteMessage(m.id)}
                                  title="Delete"
                                  aria-label="Delete message"
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
                              <div className="message-ephemeral-label">Only you can see this</div>
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
                ↑ Jump to first notification
              </button>
            )}
            {!stickToBottom && newWhileScrolledUp > 0 && (
              <button className="jump-to-bottom" onClick={onJumpToBottom}>
                ↓ {newWhileScrolledUp} new
              </button>
            )}
            <TypingIndicator typers={Object.values(typingByKey)} />
            {replyTarget && (
              <div className="reply-banner">
                <span className="muted">Replying to </span>
                <strong>
                  {users.find((u) => u.public_key === replyTarget.sender)?.display_name ||
                    replyTarget.sender_name ||
                    formatPubkey(replyTarget.sender)}
                </strong>
                <span className="reply-snippet">{replyTarget.content.slice(0, 80)}</span>
                <button className="reply-banner-close" onClick={() => onSetReplyTarget(null)} title="Cancel reply">
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
              aria-label="Compose message"
              className="input-area"
              onSubmit={(e) => { e.preventDefault(); onSend(); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) onAttachFiles(e.dataTransfer.files); }}
            >
              <label className="btn-attach" title="Attach file">
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
                      ? `Reply to ${users.find((u) => u.public_key === replyTarget.sender)?.display_name ?? "user"}`
                      : `Message #${selectedChannel.name}`
                  }
                />
              </div>
              <button type="submit">Send</button>
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
              <button onClick={onSendAllianceMessage}>Send</button>
            </div>
          </>
        ) : (
          <div className="no-channel"><p>Select a channel to start chatting</p></div>
        )}
      </main>

      {view === "channels" && !memberSidebarHidden && (
        <aside className="user-list-sidebar" aria-label="Members">
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
          onSelect={(game) => { setPickerOpen(false); setActiveGame(game); }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {activeGame && (
        <GameModal
          game={activeGame}
          theme={theme}
          publicKey={publicKey}
          displayName={myDisplayName}
          avatar={myAvatar}
          onClose={() => setActiveGame(null)}
        />
      )}
    </>
  );
}
