import React, { useEffect, useState } from "react";
import type { HubBadge, PendingBadgeOffer } from "../types";

interface Props {
  hubUrl: string;
  isAdmin: boolean;
}

export function ServerTagsSection({ hubUrl, isAdmin }: Props) {
  const [selfTags, setSelfTags] = useState<string[]>([]);
  const [nsfw, setNsfw] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  const [badges, setBadges] = useState<HubBadge[]>([]);
  const [pendingBadges, setPendingBadges] = useState<PendingBadgeOffer[]>([]);
  const [badgeLoading, setBadgeLoading] = useState(false);

  const [grantTargetUrl, setGrantTargetUrl] = useState("");
  const [grantLabel, setGrantLabel] = useState("");
  const [grantStatus, setGrantStatus] = useState<"idle" | "granting" | "ok" | "error">("idle");
  const [grantError, setGrantError] = useState("");

  useEffect(() => {
    fetchInfo();
    if (isAdmin) {
      fetchBadges();
      fetchPending();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl, isAdmin]);

  async function fetchInfo() {
    try {
      const res = await fetch(`${hubUrl}/info`);
      if (!res.ok) return;
      const data = await res.json();
      setSelfTags(data.self_tags ?? []);
      setNsfw(!!data.nsfw);
      setTagInput((data.self_tags ?? []).join(", "));
    } catch { /* ignore */ }
  }

  async function fetchBadges() {
    setBadgeLoading(true);
    try {
      const res = await fetch(`${hubUrl}/admin/badges`);
      if (!res.ok) return;
      const data = await res.json();
      setBadges(data.badges ?? []);
    } catch { /* ignore */ } finally {
      setBadgeLoading(false);
    }
  }

  async function fetchPending() {
    try {
      const res = await fetch(`${hubUrl}/admin/badges/pending`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingBadges(data.pending ?? []);
    } catch { /* ignore */ }
  }

  async function saveTags() {
    setSaveStatus("saving");
    setSaveError("");
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const res = await fetch(`${hubUrl}/admin/discovery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ self_tags: tags, nsfw }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelfTags(tags);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveError(String(e));
      setSaveStatus("error");
    }
  }

  async function acceptBadge(id: string) {
    try {
      await fetch(`${hubUrl}/admin/badges/pending/${id}/accept`, { method: "POST" });
      await fetchPending();
      await fetchBadges();
    } catch { /* ignore */ }
  }

  async function declineBadge(id: string) {
    try {
      await fetch(`${hubUrl}/admin/badges/pending/${id}/decline`, { method: "POST" });
      await fetchPending();
    } catch { /* ignore */ }
  }

  async function removeBadge(badgeId: string) {
    try {
      await fetch(`${hubUrl}/admin/badges/${badgeId}`, { method: "DELETE" });
      await fetchBadges();
    } catch { /* ignore */ }
  }

  async function grantBadge(e: React.FormEvent) {
    e.preventDefault();
    if (!grantTargetUrl.trim() || !grantLabel.trim()) return;
    setGrantStatus("granting");
    setGrantError("");
    try {
      const res = await fetch(`${hubUrl}/admin/badges/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_url: grantTargetUrl.trim(), label: grantLabel.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGrantStatus("ok");
      setGrantTargetUrl("");
      setGrantLabel("");
      setTimeout(() => setGrantStatus("idle"), 2000);
    } catch (e) {
      setGrantError(String(e));
      setGrantStatus("error");
    }
  }

  return (
    <div className="server-tags-section">
      <h1>Server tags & badges</h1>

      {isAdmin && (
        <>
          <div className="settings-section">
            <label className="settings-label">Self-tags</label>
            <p className="muted">Comma-separated keywords (max 12). Used in hub discovery search.</p>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="gaming, english, music"
            />
            <label className="checkbox-label" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
              Mark this hub as NSFW / 18+
            </label>
            {saveError && <p className="error-text">{saveError}</p>}
            <button
              className="btn-primary"
              onClick={saveTags}
              disabled={saveStatus === "saving"}
              style={{ marginTop: 8 }}
            >
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved!" : "Save tags"}
            </button>
          </div>

          <div className="settings-section">
            <label className="settings-label">Badges we hold</label>
            {badgeLoading && <p className="muted">Loading…</p>}
            {badges.length === 0 && !badgeLoading && <p className="muted">No badges yet.</p>}
            {badges.map((b, i) => (
              <div key={i} className="badge-row settings-row">
                <span className="badge-label">{b.label}</span>
                <span className="muted">{b.issuer_url}</span>
                <button className="btn-danger btn-small" onClick={() => removeBadge(b.issuer_pubkey)}>Remove</button>
              </div>
            ))}
          </div>

          {pendingBadges.length > 0 && (
            <div className="settings-section">
              <label className="settings-label">Pending badge offers</label>
              {pendingBadges.map((b) => (
                <div key={b.id} className="badge-row settings-row">
                  <div>
                    <strong>{b.label}</strong> from {b.issuer_url}
                  </div>
                  <button className="btn-primary btn-small" onClick={() => acceptBadge(b.id)}>Accept</button>
                  <button className="btn-secondary btn-small" onClick={() => declineBadge(b.id)}>Decline</button>
                </div>
              ))}
            </div>
          )}

          <div className="settings-section">
            <label className="settings-label">Grant a badge</label>
            <p className="muted">Issue a badge vouching for another hub.</p>
            <form onSubmit={grantBadge}>
              <input
                type="text"
                value={grantTargetUrl}
                onChange={(e) => setGrantTargetUrl(e.target.value)}
                placeholder="Target hub URL"
                style={{ marginBottom: 6 }}
              />
              <input
                type="text"
                value={grantLabel}
                onChange={(e) => setGrantLabel(e.target.value)}
                placeholder="Badge label (e.g. partner)"
              />
              {grantError && <p className="error-text">{grantError}</p>}
              <button
                type="submit"
                className="btn-secondary"
                disabled={grantStatus === "granting"}
                style={{ marginTop: 8 }}
              >
                {grantStatus === "granting" ? "Granting…" : grantStatus === "ok" ? "Granted!" : "Grant badge"}
              </button>
            </form>
          </div>
        </>
      )}

      {!isAdmin && (
        <div className="settings-section">
          <p className="muted">Tags: {selfTags.length > 0 ? selfTags.join(", ") : "None set"}</p>
          {nsfw && <p className="muted">This hub is marked NSFW / 18+.</p>}
        </div>
      )}
    </div>
  );
}
