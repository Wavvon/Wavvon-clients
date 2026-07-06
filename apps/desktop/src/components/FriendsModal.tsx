import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
        <h3>{t("friends.title")}</h3>

        <div className="settings-section">
          <label className="settings-label">{t("friends.add.label")}</label>
          <div className="settings-row">
            <input
              type="text"
              value={requestKey}
              onChange={(e) => onRequestKeyChange(e.target.value)}
              placeholder={t("friends.add.pubkey_placeholder")}
              onKeyDown={(e) => { if (e.key === "Enter") onSendRequest(); }}
            />
          </div>
          <div className="settings-row" style={{ marginTop: "6px" }}>
            <input
              type="text"
              value={requestHubUrl}
              onChange={(e) => onRequestHubUrlChange(e.target.value)}
              placeholder={t("friends.add.hub_placeholder")}
              onKeyDown={(e) => { if (e.key === "Enter") onSendRequest(); }}
            />
            <button onClick={onSendRequest}>{t("modal.send")}</button>
          </div>
          <p className="muted" style={{ marginTop: "6px", fontSize: "12px" }}>
            {t("friends.add.hint")}
          </p>
        </div>

        {pendingFriends.length > 0 && (
          <div className="settings-section">
            <label className="settings-label">
              {t("friends.pending.label", { count: pendingFriends.length })}
            </label>
            <ul className="friend-list">
              {pendingFriends.map((f) => (
                <li key={f.public_key} className="friend-item">
                  <span className="friend-name">
                    {f.display_name || f.public_key.slice(0, 16)}
                  </span>
                  <button onClick={() => onAcceptFriend(f.public_key)}>{t("friends.pending.accept")}</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="settings-section">
          <label className="settings-label">{t("friends.list.label", { count: friends.length })}</label>
          {friends.length === 0 ? (
            <p className="muted">{t("friends.empty")}</p>
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
                    <button onClick={() => onMessage(f.public_key, f.hub_url)}>{t("friends.message")}</button>
                    <button onClick={() => onRemoveFriend(f.public_key)} className="btn-secondary">
                      {t("friends.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>{t("modal.close")}</button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
