import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HubBadge, PendingBadgeOffer } from "../types";
import { formatRelative } from "../utils/format";

export function HubBadgesSection() {
  const [accepted, setAccepted] = useState<(HubBadge & { id: string })[]>([]);
  const [pending, setPending] = useState<PendingBadgeOffer[]>([]);
  const [grantUrl, setGrantUrl] = useState("");
  const [grantLabel, setGrantLabel] = useState("");
  const [grantStatus, setGrantStatus] = useState<"idle" | "sending" | "sent" | string>("idle");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      invoke<(HubBadge & { id: string })[]>("list_badges").catch(() => [] as (HubBadge & { id: string })[]),
      invoke<PendingBadgeOffer[]>("list_pending_badges").catch(() => [] as PendingBadgeOffer[]),
    ]).then(([a, p]) => {
      setAccepted(a);
      setPending(p);
    }).finally(() => setLoading(false));
  }, []);

  async function handleAccept(id: string) {
    try {
      await invoke("accept_badge", { badgeId: id });
      const badge = pending.find((p) => p.id === id);
      if (badge) setAccepted((prev) => [...prev, { ...badge, id }]);
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      // noop
    }
  }

  async function handleDecline(id: string) {
    try {
      await invoke("decline_badge", { badgeId: id });
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      // noop
    }
  }

  async function handleRemove(id: string) {
    try {
      await invoke("remove_badge", { badgeId: id });
      setAccepted((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      // noop
    }
  }

  async function handleGrant() {
    if (!grantUrl.trim() || !grantLabel.trim()) return;
    setGrantStatus("sending");
    try {
      await invoke("grant_badge", { targetHubUrl: grantUrl.trim(), label: grantLabel.trim() });
      setGrantStatus("sent");
      setGrantUrl("");
      setGrantLabel("");
      setTimeout(() => setGrantStatus("idle"), 2000);
    } catch (e) {
      setGrantStatus(String(e));
    }
  }

  if (loading) return <p className="muted">Loading badges…</p>;

  return (
    <div>
      {pending.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">Pending badge offers</label>
          {pending.map((b) => (
            <div key={b.id} className="settings-row" style={{ marginBottom: 8 }}>
              <div>
                <strong>{b.payload.label}</strong>
                <span className="muted" style={{ marginLeft: 8 }}>from {b.payload.issuer_url}</span>
                <span className="muted" style={{ marginLeft: 8 }}>{formatRelative(b.received_at)}</span>
              </div>
              <button onClick={() => handleAccept(b.id)}>Accept</button>
              <button className="btn-secondary" onClick={() => handleDecline(b.id)}>Decline</button>
            </div>
          ))}
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">Badges we hold</label>
        {accepted.length === 0 && <p className="muted">No accepted badges.</p>}
        {accepted.map((b) => (
          <div key={b.id} className="settings-row" style={{ marginBottom: 8 }}>
            <div>
              <strong>{b.payload.label}</strong>
              <span className="muted" style={{ marginLeft: 8 }}>from {b.payload.issuer_url}</span>
              {b.payload.expires_at && (
                <span className="muted" style={{ marginLeft: 8 }}>expires {b.payload.expires_at}</span>
              )}
            </div>
            <button className="btn-secondary" onClick={() => handleRemove(b.id)}>Remove</button>
          </div>
        ))}
      </div>

      <div className="settings-section">
        <label className="settings-label">Grant a badge to another hub</label>
        <p className="muted">Enter the target hub URL and a label to vouch for them.</p>
        <div className="settings-row">
          <input
            type="text"
            value={grantUrl}
            onChange={(e) => setGrantUrl(e.target.value)}
            placeholder="https://other-hub.example.com"
          />
          <input
            type="text"
            value={grantLabel}
            onChange={(e) => setGrantLabel(e.target.value)}
            placeholder="Badge label"
            maxLength={64}
          />
          <button onClick={handleGrant} disabled={grantStatus === "sending" || !grantUrl.trim() || !grantLabel.trim()}>
            {grantStatus === "sending" ? "Sending…" : "Grant badge"}
          </button>
        </div>
        {grantStatus === "sent" && <p className="muted">Badge offer sent.</p>}
        {grantStatus !== "idle" && grantStatus !== "sending" && grantStatus !== "sent" && (
          <p className="error-text">{grantStatus}</p>
        )}
      </div>
    </div>
  );
}
