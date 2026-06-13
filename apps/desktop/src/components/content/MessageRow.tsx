import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Message, User, RoleInfo, Hub } from "../../types";
import {
  formatPubkey,
  meAction,
  mentionsName,
  colorForKey,
  dayKey,
  formatDayLabel,
  formatFullTimestamp,
  formatRelative,
} from "@voxply/core";
import { MessageReactions } from "../MessageReactions";
import { ReactionPicker } from "../ReactionPicker";
import { MessageEmbeds } from "../MessageEmbeds";
import { MessageComponents } from "../MessageComponents";
import { IgnoredMessagePlaceholder, MessageLinkPreview, URL_RE } from "./MessageHelpers";
import { Avatar, MessageAttachments, MessageContent } from "@voxply/ui";

type HubEmojiEntry = { id: string; name: string; url: string };

interface Props {
  message: Message;
  index: number;
  prevMessage: Message | undefined;
  publicKey: string | null;
  myDisplayName: string | null;
  myRoles: RoleInfo[];
  users: User[];
  knownDisplayNames: Set<string>;
  ignoredUsers: Set<string>;
  editingMessageId: string | null;
  editingDraft: string;
  focusedMessageIndex: number;
  activeHub: Hub | undefined;
  hubEmojiMap: Map<string, HubEmojiEntry>;
  expandedThreads: Set<string>;
  threadReplies: Record<string, Message[]>;
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
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
  onOpenProfileCard: (pubkey: string, e: React.MouseEvent) => void;
  onMessageKeyDown: (e: React.KeyboardEvent<HTMLLIElement>, index: number, displayedMessages: Message[]) => void;
  onComponentInteract: (messageId: string, customId: string, values: string[]) => void;
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
  activeHub,
  hubEmojiMap,
  expandedThreads,
  threadReplies,
  hubs,
  activeHubId,
  isAdmin,
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
  onOpenProfileCard,
  onMessageKeyDown,
  onComponentInteract,
}: Props) {
  const { t } = useTranslation();

  const isIgnored = ignoredUsers.has(m.sender) && m.sender !== publicKey;
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
  const isMentioned = m.sender !== publicKey && mentionsName(m.content, myDisplayName);
  const isEphemeral = !!m.visible_to_pubkey && m.visible_to_pubkey === publicKey;
  const actionText = meAction(m.content);

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
          aria-label={msgAriaLabel}
          className={`message message-action message-row ${isMentioned ? "message-mentioned" : ""} ${isEphemeral ? "message-ephemeral" : ""}`}
        >
          <span className="action-asterisk" aria-hidden="true">*</span>
          <span className="message-sender" style={{ color: colorForKey(m.sender) }}>
            {senderLabel}
          </span>
          <span className="action-text">
            <MessageContent content={actionText} knownNames={knownDisplayNames} myName={myDisplayName} hubEmojiMap={hubEmojiMap} hubBaseUrl={activeHub?.hub_url} />
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
      {separator}
      <li
        ref={messageRowRef}
        id={`msg-${m.id}`}
        tabIndex={focusedMessageIndex === i ? 0 : -1}
        onKeyDown={(e) => onMessageKeyDown(e, i, displayedMessages)}
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
          style={{ cursor: "pointer" }}
          onClick={senderUser?.is_bot && !senderUser?.is_webhook
            ? (e) => onOpenBotCard(m.sender, e)
            : (e) => onOpenProfileCard(m.sender, e)}
        >
          <Avatar src={senderUser?.avatar} name={senderLabel} size={28} />
        </span>
        <span
          className="message-sender"
          style={{ color: colorForKey(m.sender), cursor: "pointer" }}
          onClick={senderUser?.is_bot && !senderUser?.is_webhook
            ? (e) => onOpenBotCard(m.sender, e)
            : (e) => onOpenProfileCard(m.sender, e)}
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
              <MessageContent content={m.content} knownNames={knownDisplayNames} myName={myDisplayName} hubEmojiMap={hubEmojiMap} hubBaseUrl={activeHub?.hub_url} />
            </span>
            {activeHub && URL_RE.test(m.content) && (
              <MessageLinkPreview content={m.content} activeHubUrl={activeHub.hub_url} />
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
              {isAdmin && activeHub && (
                <button
                  className="message-action"
                  title="Pin message"
                  aria-label="Pin message"
                  onClick={async () => {
                    try {
                      await invoke("pin_message", {
                        hubUrl: activeHub.hub_url,
                        channelId: m.channel_id,
                        messageId: m.id,
                      });
                      onToast("Message pinned");
                    } catch (e) {
                      onError(String(e));
                    }
                  }}
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
                        <MessageContent content={reply.content} knownNames={knownDisplayNames} myName={myDisplayName} hubEmojiMap={hubEmojiMap} hubBaseUrl={activeHub?.hub_url} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </li>
    </React.Fragment>
  );
}
