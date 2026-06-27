import React, { useEffect } from "react";
import type { Friend } from "../types";
import { FocusTrap } from "@wavvon/ui";

interface Props {
  friends: Friend[];
  pendingFriends: Friend[];
  requestKey: string;
  onRequestKeyChange: (v: string) => void;
  requestHubUrl: string;
  onRequestHubUrlChange: (v: string) => void;
  onSendRequest: () => void;
  onAcceptFriend: (key: string) => void;
  onMessage: (key: string, hubUrl: string | null) => void;
  onRemoveFriend: (key: string) => void;
  onClose: () => void;
}

export function FriendsModal({
  friends, pendingFriends,
  requestKey, onRequestKeyChange, requestHubUrl, onRequestHubUrlChange,
  onSendRequest, onAcceptFriend, onMessage, onRemoveFriend, onClose,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Friends</h3>

        <div className="settings-section">
          <label className="settings-label">Add friend</label>
          <div className="settings-row">
            <input
              type="text"
              value={requestKey}
              onChange={(e) => onRequestKeyChange(e.target.value)}
              placeholder="Public key (paste here)"
              onKeyDown={(e) => { if (e.key === "Enter") onSendRequest(); }}
            />
          </div>
          <div className="settings-row" style={{ marginTop: "6px" }}>
            <input
              type="text"
              value={requestHubUrl}
              onChange={(e) => onRequestHubUrlChange(e.target.value)}
              placeholder="Hub URL (optional — leave blank if friend is on this hub)"
              onKeyDown={(e) => { if (e.key === "Enter") onSendRequest(); }}
            />
            <button onClick={onSendRequest}>Send</button>
          </div>
          <p className="muted" style={{ marginTop: "6px", fontSize: "12px" }}>
            Same-hub friends require the other person to accept your
            request. Cross-hub friends (with a Hub URL) are added
            immediately as a one-sided address book entry.
          </p>
        </div>

        {pendingFriends.length > 0 && (
          <div className="settings-section">
            <label className="settings-label">
              Pending requests ({pendingFriends.length})
            </label>
            <ul className="friend-list">
              {pendingFriends.map((f) => (
                <li key={f.public_key} className="friend-item">
                  <span className="friend-name">
                    {f.display_name || f.public_key.slice(0, 16)}
                  </span>
                  <button onClick={() => onAcceptFriend(f.public_key)}>Accept</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="settings-section">
          <label className="settings-label">Friends ({friends.length})</label>
          {friends.length === 0 ? (
            <p className="muted">No friends yet</p>
          ) : (
            <ul className="friend-list">
              {friends.map((f) => (
                <li key={f.public_key} className="friend-item">
                  <span className="friend-name">
                    {f.display_name || f.public_key.slice(0, 16)}
                    {f.hub_url && (
                      <span
                        className="muted"
                        title={`Reachable on ${f.hub_url}`}
                        style={{ marginLeft: "6px", fontSize: "12px" }}
                      >
                        🌐 {f.hub_url}
                      </span>
                    )}
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => onMessage(f.public_key, f.hub_url)}>Message</button>
                    <button onClick={() => onRemoveFriend(f.public_key)} className="btn-secondary">
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
