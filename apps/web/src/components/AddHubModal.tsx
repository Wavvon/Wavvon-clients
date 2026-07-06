import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";
import { isPasskeySupported } from "@platform";

type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number; welcome_label?: string | null; welcome_invite_url?: string | null }
  | { state: "error"; message: string };

interface Props {
  hubUrl: string;
  onHubUrlChange: (v: string) => void;
  hubPreview: HubPreview;
  inviteCode?: string;
  onInviteCodeChange?: (v: string) => void;
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onAddWithPasskey?: () => void;
  onClose: () => void;
}

export function AddHubModal({ hubUrl, onHubUrlChange, hubPreview, inviteCode, onInviteCodeChange, loading, error, onAdd, onAddWithPasskey, onClose }: Props) {
  const { t } = useTranslation();
  const [copiedInvite, setCopiedInvite] = useState(false);
  const showPasskey = !!onAddWithPasskey && hubPreview.state === "ok" && isPasskeySupported();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-hub-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="add-hub-title">Add Hub</h3>
        <p className="muted" style={{ marginBottom: "var(--space-3)" }}>
          Paste a hub address or a <code>wavvon://</code> invite link.
        </p>
        <input
          type="text"
          value={hubUrl}
          onChange={(e) => onHubUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
            if (e.key === "Escape") onClose();
          }}
          placeholder="hub.example.com  or  wavvon://hub.example.com/invite"
          autoFocus
        />
        {hubPreview.state === "loading" && (
          <p className="muted hub-preview-status">Looking up hub…</p>
        )}
        {hubPreview.state === "error" && (
          <p className="hub-preview-error">{hubPreview.message}</p>
        )}
        {hubPreview.state === "ok" && (
          <div className="hub-preview">
            <p className="muted hub-preview-status" style={{ margin: 0 }}>
              Hub reachable — ready to connect.
            </p>
            {hubPreview.invite_only && (
              <p className="muted hub-preview-warn">
                🔒 Invite-only — paste the full invite link to join
              </p>
            )}
            {(hubPreview.min_security_level ?? 0) > 0 && (
              <p className="muted hub-preview-warn">
                ⚙️ Proof-of-work required:{" "}
                {(hubPreview.min_security_level ?? 0) >= 20
                  ? "High (~15 min)"
                  : (hubPreview.min_security_level ?? 0) >= 15
                  ? "Medium (~1 min)"
                  : "Low (<1 sec)"}
              </p>
            )}
            {hubPreview.welcome_label && (
              <div style={{ marginTop: "var(--space-2)" }}>
                <p className="muted" style={{ margin: 0 }}>
                  {t("welcome.server_by", { label: hubPreview.welcome_label })}
                </p>
                {hubPreview.welcome_invite_url && (
                  <p className="muted" style={{ margin: "4px 0 0", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onAdd} disabled={loading}>
            {loading ? "Connecting..." : "Connect"}
          </button>
        </div>
        {showPasskey && (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)", display: "block", marginBottom: 6 }}>or</span>
            <button
              className="btn-secondary"
              style={{ width: "100%" }}
              onClick={onAddWithPasskey}
              disabled={loading}
            >
              Sign in with passkey
            </button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
      </FocusTrap>
    </div>
  );
}
