import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Message, Attachment, User } from "../../types";
import { formatPubkey } from "@wavvon/core";
import { EmojiPicker } from "../EmojiPicker";
import { PendingAttachments } from "@wavvon/ui";

interface SlashCommandEntry {
  command: string;
  description: string;
  bot_name: string;
}

interface Props {
  channelName: string;
  activeHubUrl: string | undefined;
  inputText: string;
  replyTarget: Message | null;
  pendingAttachments: Attachment[];
  users: User[];
  publicKey: string | null;
  slashSuggestions: SlashCommandEntry[];
  slashSelectedIdx: number;
  mentionSuggestions: User[];
  mentionSelectedIdx: number;
  showPollButton: boolean;
  isComposing: React.RefObject<boolean>;
  messageInputRef: React.RefObject<HTMLInputElement | null>;
  onInputTextChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onPingTyping: () => void;
  onAttachFiles: (files: FileList | null) => void;
  onSetPendingAttachments: (items: Attachment[]) => void;
  onSetReplyTarget: (msg: Message | null) => void;
  onFillMention: (user: User) => void;
  onFillSlashCommand: (command: string) => void;
  onShowPollComposer: () => void;
}

export function ChannelComposer({
  channelName,
  activeHubUrl,
  inputText,
  replyTarget,
  pendingAttachments,
  users,
  publicKey,
  slashSuggestions,
  slashSelectedIdx,
  mentionSuggestions,
  mentionSelectedIdx,
  showPollButton,
  isComposing,
  messageInputRef,
  onInputTextChange,
  onKeyDown,
  onSend,
  onPingTyping,
  onAttachFiles,
  onSetPendingAttachments,
  onSetReplyTarget,
  onFillMention,
  onFillSlashCommand,
  onShowPollComposer,
}: Props) {
  const { t } = useTranslation();
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plusOpen) return;
    function onOutside(e: MouseEvent) {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [plusOpen]);

  return (
    <>
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
        <div className="composer-shell">
          <div style={{ position: "relative", flex: 1 }}>
            {slashSuggestions.length > 0 && (
              <div className="slash-command-popup">
                {slashSuggestions.map((s, i) => (
                  <div
                    key={s.command}
                    className={`slash-command-item${i === slashSelectedIdx ? " selected" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); onFillSlashCommand(s.command); }}
                  >
                    <span className="slash-command-name">/{s.command}</span>
                    <span className="slash-command-desc">{s.description}</span>
                    <span className="slash-command-bot">{s.bot_name}</span>
                  </div>
                ))}
              </div>
            )}
            {mentionSuggestions.length > 0 && (
              <div className="slash-command-popup mention-popup">
                {mentionSuggestions.map((u, i) => (
                  <div
                    key={u.public_key}
                    className={`slash-command-item${i === mentionSelectedIdx ? " selected" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); onFillMention(u); }}
                  >
                    <span className="slash-command-name">@{u.display_name}</span>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={messageInputRef}
              type="text"
              value={inputText}
              style={{ width: "100%" }}
              onChange={(e) => {
                if (!isComposing.current) {
                  onInputTextChange(e.target.value);
                  if (e.target.value.length > 0) onPingTyping();
                }
              }}
              onCompositionStart={() => { isComposing.current = true; }}
              onCompositionEnd={(e) => {
                isComposing.current = false;
                onInputTextChange((e.target as HTMLInputElement).value);
              }}
              onKeyDown={onKeyDown}
              placeholder={
                replyTarget
                  ? t("composer.placeholder.reply", { name: users.find((u) => u.public_key === replyTarget.sender)?.display_name ?? "user" })
                  : t("composer.placeholder", { channel: channelName })
              }
            />
          </div>
          <div className="composer-actions">
            <div className="composer-more" ref={plusRef}>
              <button
                type="button"
                className={`composer-btn${plusOpen ? " open" : ""}`}
                title={t("composer.more_actions")}
                aria-label={t("composer.more_actions")}
                aria-expanded={plusOpen}
                onClick={() => setPlusOpen((v) => !v)}
              >
                <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="10" y1="4" x2="10" y2="16" />
                  <line x1="4" y1="10" x2="16" y2="10" />
                </svg>
              </button>
              {plusOpen && (
                <div className="composer-more-menu" role="menu">
                  <label className="composer-more-item" role="menuitem" onClick={() => setPlusOpen(false)}>
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 10l-5 5a4 4 0 0 1-5.66-5.66l6-6a2.5 2.5 0 0 1 3.54 3.54l-6.01 6a1 1 0 0 1-1.41-1.41L13 5.5" />
                    </svg>
                    {t("composer.attach")}
                    <input
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => { onAttachFiles(e.target.files); (e.target as HTMLInputElement).value = ""; }}
                    />
                  </label>
                  {showPollButton && (
                    <button
                      type="button"
                      className="composer-more-item"
                      role="menuitem"
                      onClick={() => { setPlusOpen(false); onShowPollComposer(); }}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="13" width="4" height="5" rx="1" />
                        <rect x="8" y="8" width="4" height="10" rx="1" />
                        <rect x="14" y="3" width="4" height="15" rx="1" />
                      </svg>
                      {t("composer.create_poll")}
                    </button>
                  )}
                </div>
              )}
            </div>
            <EmojiPicker
              hubUrl={activeHubUrl}
              buttonClassName="composer-btn"
              onPick={(emoji) => {
                onInputTextChange(inputText + emoji);
                messageInputRef.current?.focus();
              }}
            />
          </div>
        </div>
        <button type="submit" className="composer-send" aria-label={t("composer.send.aria")}>{t("composer.send")}</button>
      </form>
    </>
  );
}
