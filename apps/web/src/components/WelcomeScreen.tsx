import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addHub, previewHubInfo } from "@platform";
import type { WsHandlers } from "@platform";
import type { Hub } from "@shared/types";
import { parseHubInput } from "@wavvon/core";
import type { HubInputResult } from "@wavvon/core";

type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number; challenge_mode?: string | null; welcome_label?: string | null; welcome_invite_url?: string | null }
  | { state: "error"; message: string };

interface WelcomeScreenProps {
  hubUrl: string;
  onHubUrlChange: (v: string) => void;
  hubPreview: HubPreview;
  loading: boolean;
  error: string | null;
  onJoin: () => void;
  onBrowse?: () => void;
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
  homeHubHint,
}: WelcomeScreenProps) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  return (
    <div className="empty-state welcome" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "32px 16px" }}>
      <h1 style={{ marginBottom: 8 }}>Wavvon</h1>
      <p className="welcome-tagline muted" style={{ marginBottom: 32, textAlign: "center" }}>
        {t("welcome.tagline")}
      </p>

      <section className="welcome-join" style={{ width: "100%", maxWidth: 440, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={hubUrl}
            onChange={(e) => onHubUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onJoin(); }}
            placeholder="hub.example.com  or  wavvon://…"
            autoFocus
            style={{ flex: 1 }}
          />
          <button onClick={onJoin} disabled={loading} className="btn-primary">
            {loading ? t("hub.connecting") : t("welcome.join")}
          </button>
        </div>

        {homeHubHint && (
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 4 }}>
            {t("welcome.hosted_by")}{" "}
            <a href={homeHubHint} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              {homeHubHint}
            </a>
          </p>
        )}
        {hubPreview.state === "loading" && (
          <p className="muted hub-preview-status" style={{ fontSize: "var(--text-sm)" }}>{t("welcome.looking_up")}</p>
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
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
                {t("welcome.hosted_by")}{" "}
                <a href={hubPreview.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  {hubPreview.url}
                </a>
              </p>
              {hubPreview.invite_only && (
                <p className="muted hub-preview-warn" style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>
                  {t("hub.invite_only_hint")}
                </p>
              )}
              {(hubPreview.min_security_level ?? 0) > 0 && (
                <p className="muted hub-preview-warn" style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>
                  {t("welcome.pow_required")}{" "}
                  {(hubPreview.min_security_level ?? 0) >= 20
                    ? t("welcome.pow_high")
                    : (hubPreview.min_security_level ?? 0) >= 15
                    ? t("welcome.pow_medium")
                    : t("welcome.pow_low")}
                </p>
              )}
              {hubPreview.welcome_label && (
                <div style={{ marginTop: 6 }}>
                  <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                    {t("welcome.server_by", { label: hubPreview.welcome_label })}
                  </p>
                  {hubPreview.welcome_invite_url && (
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{t("welcome.invite_line")}</span>
                      <a href={hubPreview.welcome_invite_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>
                        {hubPreview.welcome_invite_url}
                      </a>
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(hubPreview.welcome_invite_url ?? "").catch(() => {});
                          setCopiedInvite(true);
                          setTimeout(() => setCopiedInvite(false), 2000);
                        }}
                      >
                        {copiedInvite ? t("modal.copied") : t("modal.copy")}
                      </button>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="welcome-cta-row" style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {onBrowse && (
          <button className="btn-secondary" onClick={onBrowse}>
            {t("welcome.browse_hubs")}
          </button>
        )}
      </div>

      <details
        className="welcome-details"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
        style={{ maxWidth: 440, width: "100%", marginBottom: 24 }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 500, marginBottom: detailsOpen ? 8 : 0 }}>{t("welcome.what_is")}</summary>
        <ul className="welcome-points" style={{ paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>{t("welcome.hubs_label")}</strong> {t("welcome.hubs_desc")}
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>{t("welcome.identity_label")}</strong> {t("welcome.identity_desc")}
          </li>
          <li>
            <strong>{t("welcome.alliances_label")}</strong> {t("welcome.alliances_desc")}
          </li>
        </ul>
      </details>

      {error && <div className="error" style={{ marginTop: 12, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

// Standalone stateful wrapper used when rendered from App.tsx.
interface WelcomeScreenContainerProps {
  wsHandlers: WsHandlers;
  /** target is set when hubUrl was pasted from a channel/message permalink. */
  onHubAdded: (hub: Hub, target?: HubInputResult["target"]) => void;
  initialHubUrl?: string;
  onBrowse?: () => void;
}

export function WelcomeScreenContainer({ wsHandlers, onHubAdded, initialHubUrl, onBrowse }: WelcomeScreenContainerProps) {
  const [hubUrl, setHubUrl] = useState(initialHubUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hubPreview, setHubPreview] = useState<HubPreview>({ state: "idle" });

  useEffect(() => {
    const trimmed = hubUrl.trim();
    if (!trimmed) { setHubPreview({ state: "idle" }); return; }
    setHubPreview({ state: "loading" });
    const timer = setTimeout(async () => {
      try {
        const parsed = parseHubInput(trimmed);
        const cleanUrl = parsed?.hubUrl ?? trimmed;
        const info = await previewHubInfo(cleanUrl);
        setHubPreview({ state: "ok", url: cleanUrl, name: info.name, icon: info.icon, welcome_label: info.welcome_label, welcome_invite_url: info.welcome_invite_url });
      } catch (e) {
        setHubPreview({ state: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [hubUrl]);

  function handleHubUrlChange(v: string) {
    setHubUrl(v);
    setError(null);
  }

  async function handleJoin() {
    if (!hubUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = parseHubInput(hubUrl.trim());
      const cleanUrl = parsed?.hubUrl ?? hubUrl.trim();
      const inviteCode = parsed?.inviteCode || undefined;
      const hub = await addHub(cleanUrl, wsHandlers, inviteCode ? { invite_code: inviteCode } : undefined);
      onHubAdded(hub, parsed?.target);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      onBrowse={onBrowse}
      homeHubHint={initialHubUrl}
    />
  );
}
