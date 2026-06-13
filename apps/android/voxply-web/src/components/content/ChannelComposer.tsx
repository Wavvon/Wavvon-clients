import React from "react";
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
  messageInputRef: React.RefObject<HTMLInputElement | null>;
  onInputTextChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onPingTyping: () => void;
  onAttachFiles: (files: FileList | null) => void;
  onSetPendingAttachments: (items: Attachment[]) => void;
  onSetReplyTarget: (msg: Message | null) => void;
  onFillSlashCommand: (command: string) => void;
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
  messageInputRef,
  onInputTextChange,
  onKeyDown,
  onSend,
  onPingTyping,
  onAttachFiles,
  onSetPendingAttachments,
  onSetReplyTarget,
  onFillSlashCommand,
}: Props) {
  return (
    <>
      {replyTarget && (
        <div className="reply-banner">
          <span className="muted">Replying to </span>
          <strong>
            {users.find((u) => u.public_key === replyTarget.sender)?.display_name ||
              replyTarget.sender_name ||
              formatPubkey(replyTarget.sender)}
          </strong>
          <span className="reply-snippet">{replyTarget.content.slice(0, 80)}</span>
          <button className="reply-banner-close" onClick={() => onSetReplyTarget(null)} title="Cancel reply" aria-label="Cancel reply">
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
        <EmojiPicker
          hubUrl={activeHubUrl}
          onPick={(text) => onInputTextChange(inputText + text)}
        />
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
          <input
            ref={messageInputRef}
            type="text"
            value={inputText}
            style={{ width: "100%" }}
            onChange={(e) => { onInputTextChange(e.target.value); if (e.target.value.length > 0) onPingTyping(); }}
            onKeyDown={onKeyDown}
            placeholder={
              replyTarget
                ? `Reply to ${users.find((u) => u.public_key === replyTarget.sender)?.display_name ?? "user"}`
                : `Message #${channelName}`
            }
          />
        </div>
        <button onClick={onSend}>Send</button>
      </div>
    </>
  );
}
