import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PinnedMessage } from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";

interface Props {
  hubUrl: string;
  channelId: string;
  channelName: string;
  isAdmin: boolean;
  onClose: () => void;
  onScrollToMessage: (id: string) => void;
}

export function PinnedMessages({
  hubUrl,
  channelId,
  channelName,
  isAdmin,
  onClose,
  onScrollToMessage,
}: Props) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<PinnedMessage[]>("get_pinned_messages", { hubUrl, channelId })
      .then(setPins)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [hubUrl, channelId]);

  async function handleUnpin(messageId: string) {
    try {
      await invoke("unpin_message", { hubUrl, channelId, messageId });
      setPins((prev) => prev.filter((p) => p.message_id !== messageId));
    } catch {}
  }

  return (
    <div className="events-panel-overlay" onClick={onClose}>
      <div
        className="events-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Pinned messages in #${channelName}`}
      >
        <div className="events-panel-header">
          <span className="events-panel-title">📌 Pinned in #{channelName}</span>
          <button className="events-panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="events-panel-body">
          {loading && <div className="events-panel-empty">Loading…</div>}
          {error && <div className="events-panel-empty events-panel-error">{error}</div>}
          {!loading && !error && pins.length === 0 && (
            <div className="events-panel-empty">No pinned messages.</div>
          )}
          {pins.map((pin) => (
            <div key={pin.message_id} className="pinned-message-row">
              <div className="pinned-message-meta muted">
                Pinned by {formatPubkey(pin.pinned_by)} · {formatRelative(pin.pinned_at)}
              </div>
              <div
                className="pinned-message-content"
                title="Jump to message"
                style={{ cursor: "pointer" }}
                onClick={() => { onScrollToMessage(pin.message_id); onClose(); }}
              >
                <span className="message-sender">
                  {pin.message.sender_name || formatPubkey(pin.message.sender)}
                </span>
                {": "}
                <span>{pin.message.content.slice(0, 200)}</span>
              </div>
              {isAdmin && (
                <button
                  className="btn-small btn-secondary-small"
                  onClick={() => handleUnpin(pin.message_id)}
                  title="Unpin"
                >
                  Unpin
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
