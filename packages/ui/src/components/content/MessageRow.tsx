import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message, User, Hub, Poll, LinkPreview } from "../../types";
import {
  formatPubkey,
  meAction,
  mentionsName,
  colorForKey,
  dayKey,
  formatDayLabel,
  formatFullTimestamp,
  formatRelative,
  isBirthdayToday,
  parseGameLaunchCard,
} from "@wavvon/core";
import { MessageReactions } from "./MessageReactions";
import { ReactionPicker } from "./ReactionPicker";
import { MessageEmbeds } from "./MessageEmbeds";
import { MessageComponents } from "./MessageComponents";
import { LinkPreviewInMessage } from "./LinkPreviewInMessage";
import { IgnoredMessagePlaceholder } from "./MessageHelpers";
import { MessageContextMenu } from "./MessageContextMenu";
import { Avatar } from "../Avatar";
import { MessageAttachments } from "../Attachments";
import { MessageContent } from "../MessageContent";
import { GameCard } from "../GameCard";
import { PollCard } from "../polls/PollCard";

interface HubEmojiEntry { id: string; name: string; url: string; }

/** Platform-calling operations a hoisted MessageRow needs — desktop wires
 * these to Tauri `invoke()`, web to its HTTP/WS `@platform` adapter.
 * `reportMessage` has no desktop-side hub route yet; `votePoll`/`deletePoll`
 * have no desktop-side channel-scoped poll listing yet (its `get_channel_polls`
 * command hits a route shape that doesn't match the hub's real one) so
 * inline poll-in-message rendering never has a matched poll to act on there.
 * Both stay optional; MessageRow hides the affected UI when unset. */
export interface MessageRowActions {
  pinMessage: (channelId: string, messageId: string) => Promise<void>;
  unpinMessage: (channelId: string, messageId: string) => Promise<void>;
  votePoll?: (pollId: string, optionId: string) => Promise<Poll>;
  deletePoll?: (pollId: string) => Promise<void>;
  sendBotAppJoin: (botId: string, channelId: string) => void;
  fetchLinkPreview: (hubUrl: string, url: string, token?: string | null) => Promise<LinkPreview>;
  muteUser: (pubkey: string) => Promise<void>;
  kickUser: (pubkey: string) => Promise<void>;
  banUser: (pubkey: string) => Promise<void>;
  reportMessage?: (messageId: string, reason: string) => Promise<void>;
}

interface Props {
  message: Message;
  index: number;
  prevMessage: Message | undefined;
  publicKey: string | null;
  myDisplayName: string | null;
  myRoles: { permissions: string[] }[];
  users: User[];
  knownDisplayNames: Set<string>;
  /** Client-local ignore list (desktop feature web lacked — messages from an
   * ignored sender collapse to a reveal-on-click placeholder). */
  ignoredUsers?: Set<string>;
  editingMessageId: string | null;
  editingDraft: string;
  focusedMessageIndex: number;
  expandedThreads: Set<string>;
  threadReplies: Record<string, Message[]>;
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
  pinnedMessageIds?: Set<string>;
  sessionHubUrl: string | null;
  sessionToken?: string | null;
  /** Viewer opt-out from the 🎂 badge next to a birthday author's name. */
  hideBirthdays?: boolean;
  /** Hub custom-emoji `:name:` shortcode resolution — desktop feature web
   * lacked, so a custom emoji inserted via the composer rendered as literal
   * text instead of an image. Omit to skip substitution. */
  hubEmojiMap?: Map<string, HubEmojiEntry>;
  hubBaseUrl?: string;
  displayedMessages: Message[];
  messageRowRef: (el: HTMLLIElement | null) => void;
  actions: MessageRowActions;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onSetReplyTarget: (message: Message | null) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (message: Message) => void;
  onDeleteMessage: (messageId: string) => void;
  onSetEditingDraft: (v: string) => void;
  onScrollToMessage: (id: string) => void;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
  onToggleThread: (messageId: string) => void;
  onOpenImage: (src: string, alt: string) => void;
  onOpenBotCard: (pubkey: string, e: React.MouseEvent) => void;
  /** `e` is unset when triggered from the message context menu's "View
   * profile" item, which has no originating click to anchor a positioned
   * popover to — desktop's rect-based profile card skips opening in that
   * path; web's modal-style card doesn't need the event at all. */
  onAuthorClick: (pubkey: string, e?: React.MouseEvent) => void;
  onAuthorContextMenu: (e: React.MouseEvent, pubkey: string, fallbackName: string | null) => void;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  onMessageKeyDown: (e: React.KeyboardEvent<HTMLLIElement>, index: number, displayedMessages: Message[]) => void;
  onComponentInteract: (messageId: string, customId: string, values: string[]) => void;
  channelPolls?: Poll[];
  onPollUpdate: (poll: Poll) => void;
  onPollDelete: (pollId: string) => void;
}

export function MessageRow({
  message: m,
  index: i,
  prevMessage,
  publicKey,
  myDisplayName,
  myRoles,
  users,
  knownDisplayNames,
  ignoredUsers,
  editingMessageId,
  editingDraft,
  focusedMessageIndex,
  expandedThreads,
  threadReplies,
  hubs,
  activeHubId,
  isAdmin,
  pinnedMessageIds = new Set<string>(),
  sessionHubUrl,
  sessionToken,
  hideBirthdays,
  hubEmojiMap,
  hubBaseUrl,
  displayedMessages,
  messageRowRef,
  actions,
  onToggleReaction,
  onSetReplyTarget,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDeleteMessage,
  onSetEditingDraft,
  onScrollToMessage,
  onToast,
  onError,
  onToggleThread,
  onOpenImage,
  onOpenBotCard,
  onAuthorClick,
  onAuthorContextMenu,
  onPinToggle,
  onMessageKeyDown,
  onComponentInteract,
  channelPolls = [],
  onPollUpdate,
  onPollDelete,
}: Props) {
  const { t } = useTranslation();
  const [reporting, setReporting] = useState(false);
  const [reportDraft, setReportDraft] = useState("");
  const [reported, setReported] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const isIgnored = !!ignoredUsers?.has(m.sender) && m.sender !== publicKey;
  if (isIgnored) {
    return <IgnoredMessagePlaceholder key={m.id} />;
  }

  const showSeparator = !prevMessage || dayKey(m.created_at) !== dayKey(prevMessage.created_at);
  const isMine = m.sender === publicKey;
  const canDelete =
    isMine ||
    myRoles.some((r) => r.permissions.some((p) => p === "admin" || p === "manage_messages"));
  const isEditing = editingMessageId === m.id;
  const senderUser = users.find((u) => u.public_key === m.sender);
  const senderLabel = senderUser?.display_name || m.sender_name || formatPubkey(m.sender);
  const showBirthdayBadge = !hideBirthdays && isBirthdayToday(senderUser?.birthday);
  const isMentioned = m.sender !== publicKey && mentionsName(m.content, myDisplayName);
  const isEphemeral = !!m.visible_to_pubkey && m.visible_to_pubkey === publicKey;
  const actionText = meAction(m.content);
  const activeHub = hubs.find((h) => h.hub_id === activeHubId);

  // The author name/avatar already open the user menu on right-click
  // (their handler calls preventDefault) — only claim the event when it
  // bubbled from anywhere else on the row.
  function handleRowContextMenu(e: React.MouseEvent) {
    if (e.defaultPrevented) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  async function copyMessageLink() {
    const hub = hubs.find((h) => h.hub_id === activeHubId);
    if (!hub) return;
    const link = `wavvon://${hub.hub_url.replace(/^https?:\/\//, "")}/channel/${m.channel_id}/message/${m.id}`;
    try {
      await navigator.clipboard.writeText(link);
      onToast(t("message.action.link_copied"));
    } catch (e) {
      onError(String(e));
    }
  }

  async function copyMessageText() {
    try {
      await navigator.clipboard.writeText(m.content);
      onToast(t("message.action.text_copied"));
    } catch (e) {
      onError(String(e));
    }
  }

  async function togglePin() {
    const isPinned = pinnedMessageIds.has(m.id);
    try {
      if (isPinned) {
        await actions.unpinMessage(m.channel_id, m.id);
      } else {
        await actions.pinMessage(m.channel_id, m.id);
      }
      onPinToggle?.(m.id, !isPinned);
    } catch { /* pin failed silently */ }
  }

  const contextMenu = ctxMenu ? (
    <MessageContextMenu
      position={ctxMenu}
      senderLabel={senderLabel}
      senderPubkey={m.sender}
      isMine={isMine}
      canDelete={canDelete}
      isAdmin={isAdmin}
      isPinned={pinnedMessageIds.has(m.id)}
      onClose={() => setCtxMenu(null)}
      onReply={() => onSetReplyTarget(m)}
      onCopyText={() => void copyMessageText()}
      onCopyLink={() => void copyMessageLink()}
      onPinToggle={() => void togglePin()}
      onEdit={() => onStartEdit(m)}
      onDelete={() => onDeleteMessage(m.id)}
      onReport={actions.reportMessage ? () => setReporting(true) : undefined}
      onViewProfile={() => onAuthorClick(m.sender)}
      onToast={onToast}
      onMute={actions.muteUser}
      onKick={actions.kickUser}
      onBan={actions.banUser}
    />
  ) : null;

  const POLL_PREFIX = "**Poll:** ";
  const pollQuestion = m.content.startsWith(POLL_PREFIX) ? m.content.slice(POLL_PREFIX.length) : null;
  const matchedPoll = pollQuestion !== null
    ? channelPolls.find((p) => p.question === pollQuestion)
    : null;

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

  const separator = showSeparator ? (
    <li className="day-separator" aria-hidden="true">
      <span className="day-separator-label">{formatDayLabel(m.created_at)}</span>
    </li>
  ) : null;

  if (actionText !== null) {
    return (
      <React.Fragment key={m.id}>
        {separator}
        <li
          ref={messageRowRef}
          id={`msg-${m.id}`}
          tabIndex={focusedMessageIndex === i ? 0 : -1}
          onKeyDown={(e) => onMessageKeyDown(e, i, displayedMessages)}
          onContextMenu={handleRowContextMenu}
          aria-label={msgAriaLabel}
          className={`message message-action message-row ${isMentioned ? "message-mentioned" : ""}`}
        >
          <span className="action-asterisk" aria-hidden="true">*</span>
          <span
            className="message-sender"
            style={{ color: colorForKey(m.sender) }}
            onContextMenu={(e) => onAuthorContextMenu(e, m.sender, senderLabel)}
          >
            {senderLabel}
          </span>
          {showBirthdayBadge && <span title="Birthday today" aria-label="Birthday today">🎂</span>}
          <span className="action-text">
            <MessageContent content={actionText} knownNames={knownDisplayNames} myName={myDisplayName} hubEmojiMap={hubEmojiMap} hubBaseUrl={hubBaseUrl ?? activeHub?.hub_url} />
          </span>
          {contextMenu}
        </li>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment key={m.id}>
      {separator}
      <li
        ref={messageRowRef}
        id={`msg-${m.id}`}
        tabIndex={focusedMessageIndex === i ? 0 : -1}
        onKeyDown={(e) => onMessageKeyDown(e, i, displayedMessages)}
        onContextMenu={handleRowContextMenu}
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
          onClick={senderUser?.is_bot && !senderUser?.is_webhook ? (e) => onOpenBotCard(m.sender, e) : undefined}
          onContextMenu={(e) => onAuthorContextMenu(e, m.sender, senderLabel)}
        >
          <Avatar src={senderUser?.avatar} name={senderLabel} pubkey={m.sender} size={28} />
        </span>
        <span
          className="message-sender"
          style={{ color: colorForKey(m.sender), cursor: "pointer" }}
          onClick={senderUser?.is_bot && !senderUser?.is_webhook ? (e) => onOpenBotCard(m.sender, e) : (e) => onAuthorClick(m.sender, e)}
          onContextMenu={(e) => onAuthorContextMenu(e, m.sender, senderLabel)}
        >
          {senderLabel}
        </span>
        {showBirthdayBadge && <span title="Birthday today" aria-label="Birthday today">🎂</span>}
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
              <MessageContent content={m.content} knownNames={knownDisplayNames} myName={myDisplayName} hubEmojiMap={hubEmojiMap} hubBaseUrl={hubBaseUrl ?? activeHub?.hub_url} />
            </span>
            {matchedPoll && actions.votePoll && actions.deletePoll && (
              <PollCard
                poll={matchedPoll}
                isAdmin={isAdmin}
                onVote={actions.votePoll}
                onUpdate={onPollUpdate}
                onDeletePoll={actions.deletePoll}
                onDelete={onPollDelete}
              />
            )}
            {sessionHubUrl && (
              <LinkPreviewInMessage
                text={m.content}
                hubUrl={sessionHubUrl}
                token={sessionToken}
                fetchLinkPreview={actions.fetchLinkPreview}
              />
            )}
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
                onClick={() => void copyMessageLink()}
                title={t("message.action.copy_link")}
                aria-label={t("message.action.copy_link")}
              >
                🔗
              </button>
              {isAdmin && (
                <button
                  className="message-action"
                  onClick={() => void togglePin()}
                  title={pinnedMessageIds.has(m.id) ? "Unpin message" : "Pin message"}
                  aria-label={pinnedMessageIds.has(m.id) ? "Unpin message" : "Pin message"}
                >
                  📌
                </button>
              )}
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
              {!isMine && actions.reportMessage && (
                reported ? (
                  <span className="message-action muted" style={{ fontSize: "var(--text-xs)" }}>
                    Reported
                  </span>
                ) : (
                  <button
                    className="message-action"
                    title="Report message"
                    aria-label="Report message"
                    onClick={() => setReporting((v) => !v)}
                  >
                    ⚑
                  </button>
                )
              )}
            </div>
            {reporting && !reported && actions.reportMessage && (
              <div className="settings-row" style={{ marginTop: "var(--space-1)" }}>
                <input
                  type="text"
                  placeholder="Reason for report…"
                  value={reportDraft}
                  onChange={(e) => setReportDraft(e.target.value)}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button
                  className="btn-small"
                  disabled={!reportDraft.trim()}
                  onClick={async () => {
                    try {
                      await actions.reportMessage!(m.id, reportDraft.trim());
                      setReporting(false);
                      setReportDraft("");
                      setReported(true);
                      setTimeout(() => setReported(false), 2000);
                    } catch (e) {
                      onError(String(e));
                    }
                  }}
                >
                  Submit
                </button>
                <button
                  className="btn-small btn-secondary"
                  onClick={() => { setReporting(false); setReportDraft(""); }}
                >
                  Cancel
                </button>
              </div>
            )}
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
                onInteract={onComponentInteract}
              />
            )}
            {(() => {
              // Bot-authored, so parsed defensively rather than trusted outright
              // (bot-capability-layer.md §5 third-party-content threat model).
              // A result embed patched onto this same message (bot-capability-
              // layer.md §7 step 5) means the game already ended — there's no
              // PATCH shape to clear `game` itself (routes/chat_models.rs
              // EditMessageRequest has no such field), so the launch card is
              // hidden client-side instead of leaving a dead "Play" button
              // pointing at a session the bot already closed.
              const game = m.embeds && m.embeds.length > 0 ? null : parseGameLaunchCard(m.game);
              return game && <GameCard game={game} botId={m.sender} channelId={m.channel_id} onPlay={actions.sendBotAppJoin} />;
            })()}
            {isEphemeral && (
              <div className="message-ephemeral-label">{t("message.ephemeral")}</div>
            )}
            {(m.reply_count ?? 0) > 0 && (
              <div>
                <button
                  className="thread-chip"
                  onClick={() => onToggleThread(m.id)}
                  aria-expanded={expandedThreads.has(m.id)}
                >
                  {expandedThreads.has(m.id) ? "▾" : "▸"} {m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}
                </button>
              </div>
            )}
            {expandedThreads.has(m.id) && (
              <div className="thread-replies">
                {(threadReplies[m.id] ?? []).map((reply) => {
                  const rSenderUser = users.find((u) => u.public_key === reply.sender);
                  const rLabel = rSenderUser?.display_name || reply.sender_name || formatPubkey(reply.sender);
                  return (
                    <div key={reply.id} className="message" style={{ paddingTop: 2, paddingBottom: 2 }}>
                      <span className="message-sender" style={{ color: colorForKey(reply.sender) }}>
                        {rLabel}
                      </span>
                      <span className="message-time" title={formatFullTimestamp(reply.created_at)}>
                        {formatRelative(reply.created_at)}
                      </span>
                      <span className="message-content">
                        <MessageContent content={reply.content} knownNames={knownDisplayNames} myName={myDisplayName} hubEmojiMap={hubEmojiMap} hubBaseUrl={hubBaseUrl ?? activeHub?.hub_url} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {contextMenu}
      </li>
    </React.Fragment>
  );
}
