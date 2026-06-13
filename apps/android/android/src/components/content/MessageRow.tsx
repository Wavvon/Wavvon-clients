import React from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { Avatar, MessageAttachments, MessageContent } from "@voxply/ui";

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
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
  displayedMessages: Message[];
  messageRowRef: (el: HTMLDivElement | null) => void;
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
  onOpenImage: (src: string, alt: string) => void;
  onOpenBotCard: (pubkey: string, e: React.MouseEvent) => void;
  onMessageKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, index: number, displayedMessages: Message[]) => void;
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
  onOpenImage,
  onOpenBotCard,
  onMessageKeyDown,
  onComponentInteract,
}: Props) {
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

  const separator = showSeparator ? (
    <div className="day-separator" aria-hidden="true">
      <span className="day-separator-label">{formatDayLabel(m.created_at)}</span>
    </div>
  ) : null;

  if (actionText !== null) {
    return (
      <React.Fragment key={m.id}>
        {separator}
        <div
          ref={messageRowRef}
          id={`msg-${m.id}`}
          tabIndex={focusedMessageIndex === i ? 0 : -1}
          onKeyDown={(e) => onMessageKeyDown(e, i, displayedMessages)}
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
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment key={m.id}>
      {separator}
      <div
        ref={messageRowRef}
        id={`msg-${m.id}`}
        tabIndex={focusedMessageIndex === i ? 0 : -1}
        onKeyDown={(e) => onMessageKeyDown(e, i, displayedMessages)}
        className={`message message-row ${isMentioned ? "message-mentioned" : ""} ${isEphemeral ? "message-ephemeral" : ""}`}
      >
        {m.reply_to && (
          <div
            className="message-reply-preview"
            onClick={() => m.reply_to && onScrollToMessage(m.reply_to.message_id)}
            title="Jump to original"
          >
            <span className="reply-arrow">↪</span>
            <span className="reply-author">
              {m.reply_to.sender_name || formatPubkey(m.reply_to.sender)}
            </span>
            <span className="reply-snippet">{m.reply_to.content_preview}</span>
          </div>
        )}
        <span
          style={{ cursor: senderUser?.is_bot ? "pointer" : undefined }}
          onClick={senderUser?.is_bot && !senderUser?.is_webhook ? (e) => onOpenBotCard(m.sender, e) : undefined}
        >
          <Avatar src={senderUser?.avatar} name={senderLabel} size={28} />
        </span>
        <span
          className="message-sender"
          style={{ color: colorForKey(m.sender), cursor: senderUser?.is_bot ? "pointer" : undefined }}
          onClick={senderUser?.is_bot && !senderUser?.is_webhook ? (e) => onOpenBotCard(m.sender, e) : undefined}
        >
          {senderLabel}
        </span>
        {senderUser?.is_bot && !senderUser?.is_webhook && (
          <span className="bot-badge">BOT</span>
        )}
        {senderUser?.is_webhook && (
          <span className="bot-badge bot-badge--app">APP</span>
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
            <span className="message-actions">
              <ReactionPicker onPick={(emoji) => onToggleReaction(m.id, emoji)} />
              <button className="message-action" onClick={() => onSetReplyTarget(m)} title="Reply">
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
              >
                🔗
              </button>
              {isMine && (
                <button className="message-action" onClick={() => onStartEdit(m)} title="Edit">
                  ✎
                </button>
              )}
              {canDelete && (
                <button
                  className="message-action danger"
                  onClick={() => onDeleteMessage(m.id)}
                  title="Delete"
                >
                  ✕
                </button>
              )}
            </span>
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
              <div className="message-ephemeral-label">Only you can see this</div>
            )}
          </>
        )}
      </div>
    </React.Fragment>
  );
}
