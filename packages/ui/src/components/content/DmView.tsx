import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DmMessage, Attachment, User, Conversation } from "../../types";
import { formatPubkey, meAction, colorForKey, formatFullTimestamp, formatRelative } from "@wavvon/core";
import { MessageAttachments, PendingAttachments } from "../Attachments";
import { MessageContent } from "../MessageContent";
import { TypingIndicator } from "../TypingIndicator";

interface TypingEntry { name: string; ts: number }

interface Props {
  selectedConversation: Conversation;
  dmMessages: Record<string, DmMessage[]>;
  publicKey: string | null;
  blockedUsers: Set<string>;
  users: User[];
  knownDisplayNames: Set<string>;
  myDisplayName: string | null;
  pendingAttachments: Attachment[];
  inputText: string;
  dmTypingByKey: Record<string, TypingEntry>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSetPendingAttachments: (items: Attachment[]) => void;
  onAttachFiles: (files: FileList | null) => void;
  onInputTextChange: (v: string) => void;
  onPingDmTyping: () => void;
  onSendDm: () => void;
  onOpenImage: (src: string, alt: string) => void;
  /** Present only on platforms that implement group-DM sender-key E2E
   *  encryption. Gates the conversation behind a one-time acknowledgment
   *  and pushes this device's sender key on accept. Platforms without the
   *  crypto (e.g. web, pending packages/core support) omit it and fall
   *  back to the plain "not encrypted" banner. */
  onAcknowledgeGroupDm?: (conversationId: string) => void;
}

export function DmView({
  selectedConversation,
  dmMessages,
  publicKey,
  blockedUsers,
  users,
  knownDisplayNames,
  myDisplayName,
  pendingAttachments,
  inputText,
  dmTypingByKey,
  messagesEndRef,
  onSetPendingAttachments,
  onAttachFiles,
  onInputTextChange,
  onPingDmTyping,
  onSendDm,
  onOpenImage,
  onAcknowledgeGroupDm,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);
  const [groupDmAcknowledged, setGroupDmAcknowledged] = useState(false);

  function handleContainerClick(e: React.MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label")) return;
    inputRef.current?.focus();
  }

  if (selectedConversation.conv_type === "group" && onAcknowledgeGroupDm && !groupDmAcknowledged) {
    return (
      <div className="dm-group-ack-overlay">
        <div className="dm-group-ack-box">
          <p className="dm-group-ack-title">{t("dm.group_warning_title")}</p>
          <p className="dm-group-ack-body">
            {t("dm.group_banner")}
            {" "}{t("dm.group_banner_detail")}
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              setGroupDmAcknowledged(true);
              onAcknowledgeGroupDm(selectedConversation.id);
            }}
          >
            {t("dm.group_banner_got_it")}
          </button>
        </div>
      </div>
    );
  }

  return (
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
          {onAcknowledgeGroupDm ? t("dm.group_e2e_active") : t("dm.group_banner")}
        </div>
      )}
      <div className="messages">
        {(dmMessages[selectedConversation.id] || [])
          .filter((m) => !blockedUsers.has(m.sender))
          .map((m) => {
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
                <div key={m.id ?? `${m.timestamp}-${m.sender}`} className="message message-action">
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
              <div key={m.id ?? `${m.timestamp}-${m.sender}`} className="message">
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
        onClick={handleContainerClick}
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
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => {
            if (!isComposing.current) {
              onInputTextChange(e.target.value);
              if (e.target.value.length > 0) onPingDmTyping();
            }
          }}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={(e) => {
            isComposing.current = false;
            onInputTextChange((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendDm(); }
          }}
          placeholder={t("composer.dm_placeholder")}
        />
        <button onClick={onSendDm}>{t("composer.send")}</button>
      </div>
    </>
  );
}
