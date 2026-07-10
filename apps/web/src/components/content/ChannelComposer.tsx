import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Message, Attachment, User } from "../../types";
import { formatPubkey } from "@wavvon/core";
import { EmojiPicker } from "./EmojiPicker";
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
  mentionQuery: string | null;
  messageInputRef: React.RefObject<HTMLInputElement | null>;
  onInputTextChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onPingTyping: () => void;
  onAttachFiles: (files: FileList | null) => void;
  onSetPendingAttachments: (items: Attachment[]) => void;
  onSetReplyTarget: (msg: Message | null) => void;
  onFillMention: (displayName: string) => void;
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
  mentionQuery,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = inputText.trim().length > 0 || pendingAttachments.length > 0;

  function closeMore() {
    setMoreOpen(false);
    messageInputRef.current?.focus();
  }

  function handleAttachClick() {
    closeMore();
    fileInputRef.current?.click();
  }

  function handleCreatePoll() {
    closeMore();
    onShowPollComposer();
  }

  function handleShellKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && moreOpen) {
      e.stopPropagation();
      closeMore();
    }
  }

  // Clicking any empty area of the composer (padding, the shell background,
  // the mention/slash popups' gutters) should drop focus into the text
  // input, like clicking a native single-field form. Interactive
  // descendants (buttons, the file input, popup items) handle their own
  // clicks and are excluded so this doesn't fight them.
  function handleContainerClick(e: React.MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='menuitem']")) return;
    messageInputRef.current?.focus();
  }

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
        onKeyDown={handleShellKeyDown}
        onClick={handleContainerClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { onAttachFiles(e.target.files); (e.target as HTMLInputElement).value = ""; }}
        />
        <div className="composer-shell">
          <div style={{ position: "relative", flex: 1 }}>
            {mentionSuggestions.length > 0 && mentionQuery !== null && (
              <div className="mention-popup">
                {mentionSuggestions.map((u, i) => (
                  <div
                    key={u.public_key}
                    className={`mention-popup-item${i === mentionSelectedIdx ? " selected" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); if (u.display_name) onFillMention(u.display_name); }}
                  >
                    <span className="mention-popup-name">{u.display_name}</span>
                  </div>
                ))}
              </div>
            )}
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
            <input
              ref={messageInputRef}
              type="text"
              value={inputText}
              onChange={(e) => { onInputTextChange(e.target.value); if (e.target.value.length > 0) onPingTyping(); }}
              onKeyDown={onKeyDown}
              placeholder={
                replyTarget
                  ? t("composer.placeholder.reply", { name: users.find((u) => u.public_key === replyTarget.sender)?.display_name ?? "user" })
                  : t("composer.placeholder", { channel: channelName })
              }
            />
          </div>
          <div className="composer-actions">
            <div className="composer-more">
              <button
                type="button"
                className={`composer-btn${moreOpen ? " open" : ""}`}
                title={t("composer.more_actions")}
                aria-label={t("composer.more_actions")}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="10" y1="4" x2="10" y2="16" />
                  <line x1="4" y1="10" x2="16" y2="10" />
                </svg>
              </button>
              {moreOpen && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 199 }}
                    onClick={closeMore}
                    aria-hidden="true"
                  />
                  <div className="composer-more-menu" role="menu">
                    <button
                      type="button"
                      className="composer-more-item"
                      role="menuitem"
                      onClick={handleAttachClick}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M16 10l-5 5a4 4 0 0 1-5.66-5.66l6-6a2.5 2.5 0 0 1 3.54 3.54l-6.01 6a1 1 0 0 1-1.41-1.41L13 5.5" />
                      </svg>
                      {t("composer.attach")}
                    </button>
                    <button
                      type="button"
                      className="composer-more-item"
                      role="menuitem"
                      onClick={handleCreatePoll}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="13" width="4" height="5" rx="1" />
                        <rect x="8" y="8" width="4" height="10" rx="1" />
                        <rect x="14" y="3" width="4" height="15" rx="1" />
                      </svg>
                      {t("composer.create_poll")}
                    </button>
                  </div>
                </>
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
        <button
          type="submit"
          className="composer-send"
          disabled={!canSend}
          aria-label={t("composer.send.aria")}
        >
          {t("composer.send")}
        </button>
      </form>
    </>
  );
}
