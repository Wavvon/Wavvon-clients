import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message, User, RoleInfo, Hub, Poll } from "../../types";
import {
  formatPubkey,
  meAction,
  mentionsName,
  colorForKey,
  dayKey,
  formatDayLabel,
  formatFullTimestamp,
  formatRelative,
} from "@wavvon/core";
import { MessageReactions } from "../MessageReactions";
import { ReactionPicker } from "../ReactionPicker";
import { MessageEmbeds } from "../MessageEmbeds";
import { MessageComponents } from "../MessageComponents";
import { LinkPreviewInMessage } from "../LinkPreviewInMessage";
import { PollCard } from "../PollCard";
import { pinMessage, unpinMessage } from "@platform";
import { reportMessage } from "../../platform/commands/moderation";
import { Avatar, MessageAttachments, MessageContent } from "@wavvon/ui";
import { MessageContextMenu } from "./MessageContextMenu";

interface Props {
  message: Message;
  index: number;
  prevMessage: Message | undefined;
  publicKey: string | null;
  myDisplayName: string | null;
  myRoles: RoleInfo[];
  users: User[];
  knownDisplayNames: Set<string>;
  editingMessageId: string | null;
  editingDraft: string;
  focusedMessageIndex: number;
  expandedThreads: Set<string>;
  threadReplies: Record<string, Message[]>;
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
  pinnedMessageIds: Set<string>;
  sessionHubUrl: string | null;
  sessionToken: string | null;
  displayedMessages: Message[];
  messageRowRef: (el: HTMLLIElement | null) => void;
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
  onAuthorClick: (pubkey: string) => void;
  onAuthorContextMenu: (e: React.MouseEvent, pubkey: string, fallbackName: string | null) => void;
  onPinToggle?: (messageId: string, isPinned: boolean) => void;
  onMessageKeyDown: (e: React.KeyboardEvent<HTMLLIElement>, index: number, displayedMessages: Message[]) => void;
  onComponentInteract: (messageId: string, customId: string, values: string[]) => void;
  channelPolls: Poll[];
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
  editingMessageId,
  editingDraft,
  focusedMessageIndex,
  expandedThreads,
  threadReplies,
  hubs,
  activeHubId,
  isAdmin,
  pinnedMessageIds,
  sessionHubUrl,
  sessionToken,
  displayedMessages,
  messageRowRef,
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
  channelPolls,
  onPollUpdate,
  onPollDelete,
}: Props) {
  const { t } = useTranslation();
  const [reporting, setReporting] = useState(false);
  const [reportDraft, setReportDraft] = useState("");
  const [reported, setReported] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const showSeparator = !prevMessage || dayKey(m.created_at) !== dayKey(prevMessage.created_at);
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
        await unpinMessage(m.channel_id, m.id);
      } else {
        await pinMessage(m.channel_id, m.id);
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
      onReport={() => setReporting(true)}
      onViewProfile={() => onAuthorClick(m.sender)}
      onToast={onToast}
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
          <span className="action-text">
            <MessageContent content={actionText} knownNames={knownDisplayNames} myName={myDisplayName} />
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
          onClick={senderUser?.is_bot && !senderUser?.is_webhook ? (e) => onOpenBotCard(m.sender, e) : () => onAuthorClick(m.sender)}
          onContextMenu={(e) => onAuthorContextMenu(e, m.sender, senderLabel)}
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
            {matchedPoll && (
              <PollCard
                poll={matchedPoll}
                isAdmin={isAdmin}
                onUpdate={onPollUpdate}
                onDelete={onPollDelete}
              />
            )}
            {sessionHubUrl && sessionToken && (
              <LinkPreviewInMessage
                text={m.content}
                hubUrl={sessionHubUrl}
                token={sessionToken}
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
              {!isMine && (
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
            {reporting && !reported && (
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
                      await reportMessage(m.id, reportDraft.trim());
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
                hubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
                onInteract={onComponentInteract}
              />
            )}
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
                        {reply.content}
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
