import { useEffect, useState } from "react";
import { FocusTrap } from "@wavvon/ui";
import type { Friend } from "../types";
import {
  listFriends,
  listPendingFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
} from "@platform";
import { HubApiError } from "../platform/http";

interface Props {
  onClose: () => void;
  onToast?: (msg: string) => void;
}

function label(f: Friend): string {
  return f.display_name || f.public_key.slice(0, 16) + "…";
}

// A hub pubkey is 64 hex chars.
const PUBKEY_RE = /^[0-9a-fA-F]{64}$/;

export function FriendsModal({ onClose, onToast }: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [addKey, setAddKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const [f, p] = await Promise.all([listFriends(), listPendingFriendRequests()]);
      setFriends(f);
      setPending(p);
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleAdd() {
    const key = addKey.trim().toLowerCase();
    if (!PUBKEY_RE.test(key)) {
      setError("Enter a 64-character public key.");
      return;
    }
    void run(async () => {
      await sendFriendRequest(key);
      setAddKey("");
      onToast?.("Friend request sent");
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="friends-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="friends-title">Friends</h3>

          {error && <div className="error" style={{ marginBottom: "var(--space-2)" }}>{error}</div>}

          <div className="settings-section">
            <label className="settings-label" htmlFor="friend-add-key">Add a friend by public key</label>
            <div className="settings-row" style={{ gap: "var(--space-2)" }}>
              <input
                id="friend-add-key"
                type="text"
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="64-character public key"
                style={{ flex: 1 }}
              />
              <button onClick={handleAdd} disabled={busy || !addKey.trim()}>Send request</button>
            </div>
          </div>

          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              {pending.length > 0 && (
                <div className="settings-section">
                  <label className="settings-label">Pending requests</label>
                  {pending.map((f) => (
                    <div key={f.public_key} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <span>{label(f)}</span>
                      <button
                        className="btn-small"
                        disabled={busy}
                        onClick={() => run(() => acceptFriendRequest(f.public_key))}
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="settings-section">
                <label className="settings-label">Your friends</label>
                {friends.length === 0 ? (
                  <p className="muted">No friends yet.</p>
                ) : (
                  friends.map((f) => (
                    <div key={f.public_key} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <span>
                        {label(f)}
                        {f.hub_url && <span className="muted" style={{ fontSize: "var(--text-xs)" }}> · {f.hub_url}</span>}
                      </span>
                      <button
                        className="btn-small btn-secondary danger"
                        disabled={busy}
                        onClick={() => run(() => removeFriend(f.public_key))}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
