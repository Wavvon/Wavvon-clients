import React from "react";
import { useTranslation } from "react-i18next";
import type { Message, Attachment, User } from "../../types";
import { formatPubkey } from "@voxply/core";
import { EmojiPicker } from "../EmojiPicker";
import { PendingAttachments } from "@voxply/ui";

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
        <label className="btn-attach" title={t("composer.attach")}>
          📎
          <input
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { onAttachFiles(e.target.files); (e.target as HTMLInputElement).value = ""; }}
          />
        </label>
        <EmojiPicker
          hubUrl={activeHubUrl}
          onPick={(emoji) => {
            onInputTextChange(inputText + emoji);
            messageInputRef.current?.focus();
          }}
        />
        {showPollButton && (
          <button
            type="button"
            className="btn-attach"
            title="Create poll"
            onClick={onShowPollComposer}
          >
            📊
          </button>
        )}
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
        <button type="submit" aria-label={t("composer.send.aria")}>{t("composer.send")}</button>
      </form>
    </>
  );
}
