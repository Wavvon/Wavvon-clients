import React, { useState } from "react";
import { addHub } from "@platform";
import type { WsHandlers } from "@platform";
import type { Hub } from "@shared/types";

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
  onBrowse?: () => void;
  onDismiss: () => void;
  homeHubHint?: string;
}

export function WelcomeScreen({
  hubUrl,
  onHubUrlChange,
  hubPreview,
  loading,
  error,
  onJoin,
  onBrowse,
  onDismiss,
  homeHubHint,
}: WelcomeScreenProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="empty-state welcome" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "32px 16px" }}>
      <h1 style={{ marginBottom: 8 }}>Voxply</h1>
      <p className="welcome-tagline muted" style={{ marginBottom: 32, textAlign: "center" }}>
        Decentralized voice chat. Your identity, every hub.
      </p>

      <section className="welcome-join" style={{ width: "100%", maxWidth: 440, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={hubUrl}
            onChange={(e) => onHubUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onJoin(); }}
            placeholder="hub.example.com  or  voxply://…"
            autoFocus
            style={{ flex: 1 }}
          />
          <button onClick={onJoin} disabled={loading} className="btn-primary">
            {loading ? "Connecting…" : "Join hub"}
          </button>
        </div>

        {homeHubHint && (
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 4 }}>
            Served by this hub — {homeHubHint}
          </p>
        )}
        {hubPreview.state === "loading" && (
          <p className="muted hub-preview-status" style={{ fontSize: "var(--text-sm)" }}>Looking up hub…</p>
        )}
        {hubPreview.state === "error" && (
          <p className="hub-preview-error" style={{ color: "var(--danger)", fontSize: "var(--text-sm)" }}>{hubPreview.message}</p>
        )}
        {hubPreview.state === "ok" && (
          <div className="hub-preview" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
            {hubPreview.icon ? (
              <img src={hubPreview.icon} alt="" className="hub-preview-icon" style={{ width: 40, height: 40, borderRadius: "var(--r-sm)" }} />
            ) : (
              <div className="hub-preview-icon placeholder" style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)", borderRadius: "var(--r-sm)", fontWeight: 700, fontSize: "var(--text-sm)" }}>
                {hubPreview.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="hub-preview-info">
              <strong>{hubPreview.name}</strong>
              {hubPreview.description && (
                <p className="muted" style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>{hubPreview.description}</p>
              )}
              {hubPreview.invite_only && (
                <p className="muted hub-preview-warn" style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>
                  Invite-only — paste the full invite link to join
                </p>
              )}
              {(hubPreview.min_security_level ?? 0) > 0 && (
                <p className="muted hub-preview-warn" style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>
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

      <div className="welcome-cta-row" style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {onBrowse && (
          <button className="btn-secondary" onClick={onBrowse}>
            Browse public hubs
          </button>
        )}
      </div>

      <details
        className="welcome-details"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
        style={{ maxWidth: 440, width: "100%", marginBottom: 24 }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 500, marginBottom: detailsOpen ? 8 : 0 }}>What is Voxply?</summary>
        <ul className="welcome-points" style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Hubs</strong> are independently-run servers — pick any one
            to join, or run your own. The same you works on every hub.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Your identity</strong> is a keypair stored on this device,
            not an account on a service. Nobody can deplatform you.
          </li>
          <li>
            <strong>Alliances</strong> let hubs share channels with each other
            so communities stay connected without merging.
          </li>
        </ul>
      </details>

      <button className="welcome-settings-link muted btn-ghost" onClick={onDismiss} style={{ fontSize: "var(--text-sm)" }}>
        Skip for now
      </button>

      {error && <div className="error" style={{ marginTop: 12, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

// Standalone stateful wrapper used when rendered from App.tsx.
interface WelcomeScreenContainerProps {
  wsHandlers: WsHandlers;
  onHubAdded: (hub: Hub) => void;
  onDismiss: () => void;
  initialHubUrl?: string;
}

export function WelcomeScreenContainer({ wsHandlers, onHubAdded, onDismiss, initialHubUrl }: WelcomeScreenContainerProps) {
  const [hubUrl, setHubUrl] = useState(initialHubUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hubPreview, setHubPreview] = useState<HubPreview>({ state: "idle" });

  function handleHubUrlChange(v: string) {
    setHubUrl(v);
    setHubPreview({ state: "idle" });
    setError(null);
  }

  async function handleJoin() {
    if (!hubUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const hub = await addHub(hubUrl.trim(), wsHandlers);
      onHubAdded(hub);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <WelcomeScreen
      hubUrl={hubUrl}
      onHubUrlChange={handleHubUrlChange}
      hubPreview={hubPreview}
      loading={loading}
      error={error}
      onJoin={handleJoin}
      onDismiss={onDismiss}
      homeHubHint={initialHubUrl}
    />
  );
}
