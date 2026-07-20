import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Friend } from "../../types";
import { FocusTrap } from "../FocusTrap";

/** Platform-calling operations the friends modal needs. `sendFriendRequest`
 * takes an optional target hub URL — desktop lets a request specify which
 * hub the target lives on (federated); web's request always targets the
 * active hub, so it simply never passes one. */
export interface FriendsModalActions {
  listFriends: () => Promise<Friend[]>;
  listPendingFriendRequests: () => Promise<Friend[]>;
  sendFriendRequest: (targetPublicKey: string, hubUrl?: string) => Promise<void>;
  acceptFriendRequest: (fromPublicKey: string) => Promise<void>;
  removeFriend: (targetPublicKey: string) => Promise<void>;
}

interface Props {
  actions: FriendsModalActions;
  onClose: () => void;
  onToast?: (msg: string) => void;
  /** Message this friend directly — federated friends carry a `hub_url`
   *  the caller may need to route the DM to the right hub. */
  onMessage?: (pubkey: string, hubUrl: string | null) => void;
}

function label(f: Friend): string {
  return f.display_name || f.public_key.slice(0, 16) + "…";
}

// A hub pubkey is 64 hex chars.
const PUBKEY_RE = /^[0-9a-fA-F]{64}$/;

export function FriendsModal({ actions, onClose, onToast, onMessage }: Props) {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [addKey, setAddKey] = useState("");
  const [addHubUrl, setAddHubUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const [f, p] = await Promise.all([actions.listFriends(), actions.listPendingFriendRequests()]);
      setFriends(f);
      setPending(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(String(e));
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
      await actions.sendFriendRequest(key, addHubUrl.trim() || undefined);
      setAddKey("");
      setAddHubUrl("");
      onToast?.("Friend request sent");
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal modal-wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="friends-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="friends-title">{t("friends.title")}</h3>

          {error && <div className="error" style={{ marginBottom: "var(--space-2)" }}>{error}</div>}

          <div className="settings-section">
            <label className="settings-label" htmlFor="friend-add-key">{t("friends.add.label")}</label>
            <div className="settings-row">
              <input
                id="friend-add-key"
                type="text"
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder={t("friends.add.pubkey_placeholder")}
              />
            </div>
            <div className="settings-row" style={{ marginTop: "6px" }}>
              <input
                type="text"
                value={addHubUrl}
                onChange={(e) => setAddHubUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder={t("friends.add.hub_placeholder")}
              />
              <button onClick={handleAdd} disabled={busy || !addKey.trim()}>{t("modal.send")}</button>
            </div>
            <p className="muted" style={{ marginTop: "6px", fontSize: "12px" }}>
              {t("friends.add.hint")}
            </p>
          </div>

          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              {pending.length > 0 && (
                <div className="settings-section">
                  <label className="settings-label">{t("friends.pending.label", { count: pending.length })}</label>
                  <ul className="friend-list">
                    {pending.map((f) => (
                      <li key={f.public_key} className="friend-item">
                        <span className="friend-name">{label(f)}</span>
                        <button disabled={busy} onClick={() => run(() => actions.acceptFriendRequest(f.public_key))}>
                          {t("friends.pending.accept")}
                        </button>
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
                          {label(f)}
                          {f.hub_url && (
                            <span className="muted" title={`Reachable on ${f.hub_url}`} style={{ marginLeft: "6px", fontSize: "12px" }}>
                              🌐 {f.hub_url}
                            </span>
                          )}
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {onMessage && (
                            <button onClick={() => onMessage(f.public_key, f.hub_url)}>{t("friends.message")}</button>
                          )}
                          <button
                            className="btn-secondary danger"
                            disabled={busy}
                            onClick={() => run(() => actions.removeFriend(f.public_key))}
                          >
                            {t("friends.remove")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>{t("modal.close")}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
