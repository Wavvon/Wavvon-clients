import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { User } from "../types";
import { formatPubkey } from "../utils/format";
import { FocusTrap } from "./FocusTrap";

interface ChannelBan {
  channel_id: string;
  target_public_key: string;
  banned_by: string;
  reason: string | null;
  created_at: number;
}

export function ChannelBansModal({
  channelId,
  channelName,
  users,
  onClose,
  onError,
}: {
  channelId: string;
  channelName: string;
  users: User[];
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [bans, setBans] = useState<ChannelBan[]>([]);
  const [picking, setPicking] = useState<string>("");
  const [reason, setReason] = useState("");

  async function refresh() {
    try {
      const list = await invoke<ChannelBan[]>("list_channel_bans", { channelId });
      setBans(list);
    } catch (e) {
      onError(String(e));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleBan() {
    if (!picking) return;
    try {
      await invoke("channel_ban_user", {
        channelId,
        targetPublicKey: picking,
        reason: reason.trim() || null,
      });
      setPicking("");
      setReason("");
      await refresh();
    } catch (e) {
      onError(String(e));
    }
  }

  async function handleUnban(targetPk: string) {
    try {
      await invoke("channel_unban_user", {
        channelId,
        targetPublicKey: targetPk,
      });
      await refresh();
    } catch (e) {
      onError(String(e));
    }
  }

  // Hide already-banned users from the dropdown so admins don't try to
  // double-ban.
  const bannedSet = new Set(bans.map((b) => b.target_public_key));
  const candidates = users.filter((u) => !bannedSet.has(u.public_key));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Channel bans — #{channelName}</h3>
        <p className="muted">
          A channel ban blocks the user from sending in this channel only.
          Hub-wide bans are managed from the admin panel.
        </p>

        <div className="settings-section">
          <label className="settings-label">Ban a user</label>
          <div className="settings-row" style={{ alignItems: "stretch" }}>
            <select
              value={picking}
              onChange={(e) => setPicking(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">— pick a user —</option>
              {candidates.map((u) => (
                <option key={u.public_key} value={u.public_key}>
                  {u.display_name || formatPubkey(u.public_key)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              style={{ flex: 2 }}
            />
            <button onClick={handleBan} disabled={!picking}>
              Ban
            </button>
          </div>
        </div>

        <div className="settings-section">
          <label className="settings-label">
            Currently banned — {bans.length}
          </label>
          {bans.length === 0 ? (
            <p className="muted">No one is banned from this channel.</p>
          ) : (
            <ul className="alliance-members">
              {bans.map((b) => {
                const u = users.find((x) => x.public_key === b.target_public_key);
                return (
                  <li
                    key={b.target_public_key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      <strong>
                        {u?.display_name || formatPubkey(b.target_public_key)}
                      </strong>
                      {b.reason && <span className="muted"> — {b.reason}</span>}
                    </span>
                    <button
                      className="btn-small"
                      onClick={() => handleUnban(b.target_public_key)}
                    >
                      Unban
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
      </FocusTrap>
    </div>
  );
}
