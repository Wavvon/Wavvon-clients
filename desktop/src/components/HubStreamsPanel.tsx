import React from "react";
import type { HubStreamInfo } from "../types";

interface Props {
  streams: HubStreamInfo[];
  subscribedIds: Set<string>;
  currentChannelId: string | null;
  onSubscribe: (channelId: string, streamId: string) => void;
  onUnsubscribe: (channelId: string, streamId: string) => void;
  onClose: () => void;
}

export function HubStreamsPanel({
  streams,
  subscribedIds,
  currentChannelId,
  onSubscribe,
  onUnsubscribe,
  onClose,
}: Props) {
  // Only show streams from OTHER channels (streams in the current channel are
  // already shown by the channel viewer).
  const crossChannelStreams = streams.filter(
    (s) => s.channel_id !== currentChannelId && s.kind === "screen"
  );

  return (
    <div className="hub-streams-panel">
      <div className="hub-streams-header">
        <span className="hub-streams-title">Hub streams</span>
        <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {crossChannelStreams.length === 0 ? (
        <p className="muted hub-streams-empty">No active streams in other channels.</p>
      ) : (
        <ul className="hub-streams-list">
          {crossChannelStreams.map((s) => {
            const isSubscribed = subscribedIds.has(s.stream_id);
            return (
              <li key={s.stream_id} className="hub-streams-item">
                <div className="hub-streams-meta">
                  <span className="hub-streams-sharer">{s.sharer_pubkey.slice(0, 8)}…</span>
                  <span className="muted hub-streams-channel">#{s.channel_id.slice(0, 8)}</span>
                </div>
                <button
                  className={isSubscribed ? "btn-secondary hub-streams-btn--active" : "btn-secondary"}
                  onClick={() =>
                    isSubscribed
                      ? onUnsubscribe(s.channel_id, s.stream_id)
                      : onSubscribe(s.channel_id, s.stream_id)
                  }
                >
                  {isSubscribed ? "Stop watching" : "Watch"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
