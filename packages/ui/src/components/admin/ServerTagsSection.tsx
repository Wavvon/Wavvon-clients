import { useEffect, useState } from "react";
import type { HubBadge, HubSelfTagSettings, PendingBadgeOffer } from "../../types";

export interface ServerTagsSectionActions {
  getDiscoveryTags: () => Promise<HubSelfTagSettings>;
  setDiscoveryTags: (tags: string[], nsfw: boolean) => Promise<void>;
  listBadges: () => Promise<HubBadge[]>;
  listPendingBadges: () => Promise<PendingBadgeOffer[]>;
  acceptBadge: (id: string) => Promise<void>;
  declineBadge: (id: string) => Promise<void>;
  removeBadge: (id: string) => Promise<void>;
  grantBadge: (targetHubUrl: string, label: string) => Promise<void>;
}

interface Props {
  actions: ServerTagsSectionActions;
}

export function ServerTagsSection({ actions }: Props) {
  const [tagsInput, setTagsInput] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");

  const [badges, setBadges] = useState<HubBadge[]>([]);
  const [pendingBadges, setPendingBadges] = useState<PendingBadgeOffer[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);

  const [grantTargetUrl, setGrantTargetUrl] = useState("");
  const [grantLabel, setGrantLabel] = useState("");
  const [grantStatus, setGrantStatus] = useState<"idle" | "sending" | "ok" | string>("idle");

  useEffect(() => {
    void loadTags();
    void loadBadgeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTags() {
    try {
      const s = await actions.getDiscoveryTags();
      setTagsInput(s.self_tags.join(", "));
      setNsfw(s.nsfw);
    } catch { /* first load — ignore */ }
  }

  async function loadBadgeData() {
    setLoadingBadges(true);
    try {
      const [b, p] = await Promise.all([actions.listBadges(), actions.listPendingBadges()]);
      setBadges(b);
      setPendingBadges(p);
    } catch { /* ignore */ } finally {
      setLoadingBadges(false);
    }
  }

  async function handleSaveTags() {
    setSaveStatus("saving");
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await actions.setDiscoveryTags(tags, nsfw);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleAccept(id: string) {
    try { await actions.acceptBadge(id); await loadBadgeData(); } catch { /* ignore */ }
  }

  async function handleDecline(id: string) {
    try { await actions.declineBadge(id); await loadBadgeData(); } catch { /* ignore */ }
  }

  async function handleRemoveBadge(id: string) {
    try { await actions.removeBadge(id); await loadBadgeData(); } catch { /* ignore */ }
  }

  async function handleGrantBadge() {
    if (!grantTargetUrl.trim() || !grantLabel.trim()) return;
    setGrantStatus("sending");
    try {
      await actions.grantBadge(grantTargetUrl.trim(), grantLabel.trim());
      setGrantStatus("ok");
      setGrantTargetUrl("");
      setGrantLabel("");
      setTimeout(() => setGrantStatus("idle"), 2000);
    } catch (e) {
      setGrantStatus(String(e));
    }
  }

  return (
    <section>
      <h1>Server Tags &amp; Badges</h1>

      <div className="settings-section">
        <label className="settings-label">Self-tags</label>
        <p className="muted">
          Comma-separated keywords for discovery. Max 12 tags, 1–32 chars each.
          Reserved words (verified, certified, etc.) are rejected.
        </p>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="gaming, english, casual"
          style={{ width: "100%" }}
        />
        <label className="checkbox-label" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
          This community has 18+ / NSFW content
        </label>
        {saveStatus === "saved" && <p className="muted">Saved.</p>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <p className="error-text">{saveStatus}</p>
        )}
        <button onClick={handleSaveTags} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Saving…" : "Save tags"}
        </button>
      </div>

      <div className="settings-section">
        <label className="settings-label">Badges we hold</label>
        <p className="muted">
          Third-party attestations from other hubs. Each badge is cryptographically
          signed by the issuing hub and visible on your public profile.
        </p>
        {loadingBadges && <p className="muted">Loading…</p>}
        {badges.length === 0 && !loadingBadges && (
          <p className="muted">No accepted badges yet.</p>
        )}
        {badges.map((b) => (
          <div key={b.id} className="settings-row">
            <div>
              <span className="discover-badge-attestation">🏅 {b.label}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-sm)" }}>
                from {b.issuer_url}
              </span>
            </div>
            <button className="btn-secondary danger" onClick={() => handleRemoveBadge(b.id)}>Remove</button>
          </div>
        ))}
      </div>

      {pendingBadges.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">Pending badge offers</label>
          {pendingBadges.map((p) => (
            <div key={p.id} className="settings-row">
              <div>
                <span>🏅 {p.label}</span>
                <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-sm)" }}>
                  from {p.issuer_url}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleAccept(p.id)}>Accept</button>
                <button className="btn-secondary" onClick={() => handleDecline(p.id)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">Grant a badge to another hub</label>
        <p className="muted">
          Sign an attestation for another hub. They must accept it before it appears
          on their profile. Badges do not auto-expire unless you set an expiry.
        </p>
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <input
            type="text"
            placeholder="Target hub URL"
            value={grantTargetUrl}
            onChange={(e) => setGrantTargetUrl(e.target.value)}
            style={{ width: "100%" }}
          />
          <input
            type="text"
            placeholder="Badge label (e.g. raid-alliance-certified)"
            value={grantLabel}
            onChange={(e) => setGrantLabel(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        {grantStatus === "ok" && <p className="muted">Badge offer sent.</p>}
        {grantStatus !== "idle" && grantStatus !== "sending" && grantStatus !== "ok" && (
          <p className="error-text">{grantStatus}</p>
        )}
        <button
          onClick={handleGrantBadge}
          disabled={!grantTargetUrl.trim() || !grantLabel.trim() || grantStatus === "sending"}
        >
          {grantStatus === "sending" ? "Sending…" : "Grant badge"}
        </button>
      </div>
    </section>
  );
}
