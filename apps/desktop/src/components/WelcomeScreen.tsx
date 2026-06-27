import React, { useState } from "react";

type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number; challenge_mode?: string | null }
  | { state: "error"; message: string };

interface WelcomeScreenProps {
  hubUrl: string;
  onHubUrlChange: (v: string) => void;
  hubPreview: HubPreview;
  loading: boolean;
  error: string | null;
  onJoin: () => void;
  onBrowse: () => void;
  onCheckHubUrl?: () => void;
  onDismiss: () => void;
}

export function WelcomeScreen({
  hubUrl,
  onHubUrlChange,
  hubPreview,
  loading,
  error,
  onJoin,
  onBrowse,
  onCheckHubUrl,
  onDismiss,
}: WelcomeScreenProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="empty-state welcome">
      <h1>Wavvon</h1>
      <p className="welcome-tagline">
        Decentralized voice chat. Your identity, every hub.
      </p>

      <section className="welcome-join">
        <input
          type="text"
          value={hubUrl}
          onChange={(e) => onHubUrlChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onJoin(); }}
          placeholder="hub.example.com  or  wavvon://…"
          autoFocus
        />
        <button onClick={onJoin} disabled={loading}>
          {loading ? "Connecting…" : "Join hub"}
        </button>

        {hubPreview.state === "loading" && (
          <p className="muted hub-preview-status">Looking up hub…</p>
        )}
        {hubPreview.state === "error" && (
          <p className="hub-preview-error">{hubPreview.message}</p>
        )}
        {hubPreview.state === "ok" && (
          <div className="hub-preview">
            {hubPreview.icon ? (
              <img src={hubPreview.icon} alt="" className="hub-preview-icon" />
            ) : (
              <div className="hub-preview-icon placeholder">
                {hubPreview.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="hub-preview-info">
              <strong>{hubPreview.name}</strong>
              {hubPreview.description && (
                <p className="muted">{hubPreview.description}</p>
              )}
              {hubPreview.invite_only && (
                <p className="muted hub-preview-warn">
                  Invite-only — paste the full invite link to join
                </p>
              )}
              {(hubPreview.min_security_level ?? 0) > 0 && (
                <p className="muted hub-preview-warn">
                  Proof-of-work required:{" "}
                  {(hubPreview.min_security_level ?? 0) >= 20
                    ? "High (~15 min)"
                    : (hubPreview.min_security_level ?? 0) >= 15
                    ? "Medium (~1 min)"
                    : "Low (<1 sec)"}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="welcome-cta-row">
        <button className="btn-secondary" onClick={onBrowse}>
          Browse public hubs
        </button>
        {onCheckHubUrl && (
          <button className="btn-secondary" onClick={onCheckHubUrl}>
            Check a hub URL
          </button>
        )}
      </div>

      <details
        className="welcome-details"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>What is Wavvon?</summary>
        <ul className="welcome-points">
          <li>
            <strong>Hubs</strong> are independently-run servers — pick any one
            to join, or run your own. The same you works on every hub.
          </li>
          <li>
            <strong>Your identity</strong> is a keypair stored on this device,
            not an account on a service. Nobody can deplatform you.
          </li>
          <li>
            <strong>Alliances</strong> let hubs share channels with each other
            so communities stay connected without merging.
          </li>
        </ul>
      </details>

      <button className="welcome-settings-link muted" onClick={onDismiss}>
        Skip for now
      </button>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
