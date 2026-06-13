import React from "react";
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
} from "@voxply/utils";
import { Avatar } from "../Avatar";
import { MessageContent } from "../MessageContent";
import { MessageAttachments } from "../Attachments";
import { MessageReactions } from "../MessageReactions";
import { ReactionPicker } from "../ReactionPicker";
import { MessageEmbeds } from "../MessageEmbeds";
import { MessageComponents } from "../MessageComponents";

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
  expandedThreads: Set<string>;
  threadReplies: Record<string, Message[]>;
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
  onToggleThread: (messageId: string) => void;
  onOpenImage: (src: string, alt: string) => void;
  onOpenBotCard: (pubkey: string, e: React.MouseEvent) => void;
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
  editingMessageId,
  editingDraft,
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
    <div className="day-separator">
      <span className="day-separator-label">{formatDayLabel(m.created_at)}</span>
    </div>
  ) : null;

  if (actionText !== null) {
    return (
      <React.Fragment key={m.id}>
        {separator}
        <div
          id={`msg-${m.id}`}
          role="listitem"
          className={`message message-action ${isMentioned ? "message-mentioned" : ""}`}
        >
          <span className="action-asterisk">*</span>
          <span className="message-sender" style={{ color: colorForKey(m.sender) }}>
            {senderLabel}
          </span>
          <span className="action-text">
            <MessageContent content={actionText} knownNames={knownDisplayNames} myName={myDisplayName} />
          </span>
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment key={m.id}>
      {separator}
      <div
        id={`msg-${m.id}`}
        role="listitem"
        className={`message ${isMentioned ? "message-mentioned" : ""} ${isEphemeral ? "message-ephemeral" : ""}`}
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
                <button className="message-action" onClick={() => onStartEdit(m)} title="Edit" aria-label="Edit">
                  ✎
                </button>
              )}
              {canDelete && (
                <button
                  className="message-action danger"
                  onClick={() => onDeleteMessage(m.id)}
                  title="Delete"
                  aria-label="Delete"
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
                hubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
                onInteract={onComponentInteract}
              />
            )}
            {isEphemeral && (
              <div className="message-ephemeral-label">Only you can see this</div>
            )}
            {(m.reply_count ?? 0) > 0 && (
              <button className="thread-chip" onClick={() => onToggleThread(m.id)}>
                {expandedThreads.has(m.id) ? "▾" : "▸"} {m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}
              </button>
            )}
            {expandedThreads.has(m.id) && (
              <div className="thread-replies">
                {(threadReplies[m.id] ?? []).map(reply => (
                  <div key={reply.id} className="thread-reply">
                    <strong>{reply.sender_name ?? reply.sender.slice(0, 8)}</strong>: {reply.content}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </React.Fragment>
  );
}
