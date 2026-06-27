import React from "react";
import { useTranslation } from "react-i18next";
import type { Message, AllianceSharedChannel } from "../../types";
import { formatPubkey, colorForKey, formatFullTimestamp, formatRelative } from "@wavvon/core";
import { Avatar } from "../Avatar";
import { MessageContent } from "../MessageContent";
import { MessageAttachments } from "../Attachments";

interface SelectedAllianceChannel {
  alliance_id: string;
  alliance_name: string;
  channel: AllianceSharedChannel;
}

interface Props {
  selectedAllianceChannel: SelectedAllianceChannel;
  allianceMessages: Message[];
  inputText: string;
  knownDisplayNames: Set<string>;
  myDisplayName: string | null;
  onInputTextChange: (v: string) => void;
  onSendAllianceMessage: () => void;
  onOpenImage: (src: string, alt: string) => void;
}

export function AllianceView({
  selectedAllianceChannel,
  allianceMessages,
  inputText,
  knownDisplayNames,
  myDisplayName,
  onInputTextChange,
  onSendAllianceMessage,
  onOpenImage,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="channel-header">
        <div className="channel-header-info">
          <h3># {selectedAllianceChannel.channel.channel_name}</h3>
          <p className="channel-description">
            🤝 {selectedAllianceChannel.alliance_name} · hosted on{" "}
            {selectedAllianceChannel.channel.hub_name}
          </p>
        </div>
      </div>
      <div className="messages">
        {allianceMessages.map((m) => {
          const senderLabel = m.sender_name || formatPubkey(m.sender);
          return (
            <div key={m.id} className="message">
              <Avatar src={null} name={senderLabel} size={28} />
              <span className="message-sender" style={{ color: colorForKey(m.sender) }}>
                {senderLabel}
              </span>
              <span className="message-content">
                <MessageContent content={m.content} knownNames={knownDisplayNames} myName={myDisplayName} />
              </span>
              {m.attachments && m.attachments.length > 0 && (
                <MessageAttachments items={m.attachments} onImageClick={onOpenImage} />
              )}
              <span className="message-time" title={formatFullTimestamp(m.created_at)}>
                {formatRelative(m.created_at)}
              </span>
            </div>
          );
        })}
        {allianceMessages.length === 0 && (
          <p className="muted" style={{ padding: "1rem" }}>
            No messages yet in this alliance channel.
          </p>
        )}
      </div>
      <div className="input-area">
        <input
          type="text"
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendAllianceMessage(); }
          }}
          placeholder={`Message ${selectedAllianceChannel.channel.hub_name} · #${selectedAllianceChannel.channel.channel_name}`}
        />
        <button onClick={onSendAllianceMessage}>{t("composer.send")}</button>
      </div>
    </>
  );
}
