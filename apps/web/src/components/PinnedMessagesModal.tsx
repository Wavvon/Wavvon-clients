import React, { useEffect, useState } from "react";
import type { PinnedMessage } from "../types";
import { getPins } from "@platform";
import { formatRelative } from "@voxply/core";
import { FocusTrap } from "@voxply/ui";

interface Props {
  channelId: string;
  channelName: string;
  onClose: () => void;
  onScrollToMessage: (id: string) => void;
}

export function PinnedMessagesModal({ channelId, channelName, onClose, onScrollToMessage }: Props) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPins(channelId)
      .then(setPins)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pinned messages"
    >
      <FocusTrap>
      <div
        className="modal-box"
        style={{ maxWidth: 520, maxHeight: "70vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 600 }}>
            Pinned messages · #{channelName}
          </h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading && <p className="muted" style={{ textAlign: "center" }}>Loading…</p>}
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          {!loading && !error && pins.length === 0 && (
            <p className="muted" style={{ textAlign: "center", padding: 16 }}>No pinned messages.</p>
          )}
          {pins.map((pin) => (
            <div
              key={pin.id}
              className="pinned-message-row"
              style={{ padding: "10px 0", borderBottom: "1px solid var(--border-subtle, var(--border))" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                  {pin.sender_name ?? pin.sender.slice(0, 12)}
                </span>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {formatRelative(pin.created_at)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {pin.content}
              </p>
              <button
                className="btn-ghost"
                style={{ marginTop: 6, fontSize: "var(--text-xs)" }}
                onClick={() => { onScrollToMessage(pin.id); onClose(); }}
              >
                Jump to message
              </button>
            </div>
          ))}
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
