import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import { FocusTrap } from "../FocusTrap";

/** One entry of `GET /channels/{id}/pins` — matches the hub's `PinResponse`. */
export interface PinnedMessageEntry {
  message_id: string;
  pinned_by: string;
  pinned_at: number;
  message: {
    id: string;
    content: string;
    sender: string;
    sender_name: string | null;
    created_at: number;
  };
}

interface Props {
  channelName: string;
  /** Show the Unpin button (viewer has manage_messages). */
  canUnpin: boolean;
  getPins: () => Promise<PinnedMessageEntry[]>;
  unpinMessage: (messageId: string) => Promise<void>;
  onClose: () => void;
  onScrollToMessage: (id: string) => void;
}

export function PinnedMessagesModal({
  channelName,
  canUnpin,
  getPins,
  unpinMessage,
  onClose,
  onScrollToMessage,
}: Props) {
  const { t } = useTranslation();
  const [pins, setPins] = useState<PinnedMessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPins()
      .then(setPins)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleUnpin(messageId: string) {
    try {
      await unpinMessage(messageId);
      setPins((prev) => prev.filter((p) => p.message_id !== messageId));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Pinned messages in #${channelName}`}
    >
      <FocusTrap>
      <div
        className="modal-box"
        style={{ maxWidth: 520, maxHeight: "70vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 600 }}>
            📌 Pinned messages · #{channelName}
          </h2>
          <button className="btn-ghost" onClick={onClose} aria-label={t("modal.close")}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading && <p className="muted" style={{ textAlign: "center" }}>{t("message.pinned.loading")}</p>}
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          {!loading && !error && pins.length === 0 && (
            <p className="muted" style={{ textAlign: "center", padding: 16 }}>{t("message.pinned.empty")}</p>
          )}
          {pins.map((pin) => (
            <div key={pin.message_id} className="pinned-message-row">
              <div className="pinned-message-meta muted">
                Pinned by {formatPubkey(pin.pinned_by)} · {formatRelative(pin.pinned_at)}
              </div>
              <div
                className="pinned-message-content"
                title={t("message.pinned.jump")}
                onClick={() => { onScrollToMessage(pin.message_id); onClose(); }}
              >
                <span className="message-sender">
                  {pin.message.sender_name || formatPubkey(pin.message.sender)}
                </span>
                {": "}
                <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {pin.message.content.slice(0, 200)}
                </span>
                <span className="muted" style={{ fontSize: "var(--text-xs)", marginLeft: 8 }}>
                  {formatRelative(pin.message.created_at)}
                </span>
              </div>
              {canUnpin && (
                <button
                  className="btn-small btn-secondary-small"
                  onClick={() => handleUnpin(pin.message_id)}
                  title={t("message.pinned.unpin")}
                >
                  {t("message.pinned.unpin")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
