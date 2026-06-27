import React from "react";
import { FocusTrap } from "@wavvon/ui";

type HubPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; url: string; name: string; description?: string | null; icon?: string | null; invite_only?: boolean; min_security_level?: number }
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
  onClose: () => void;
}

export function AddHubModal({ hubUrl, onHubUrlChange, hubPreview, inviteCode, onInviteCodeChange, loading, error, onAdd, onClose }: Props) {
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
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
                Hosted by{" "}
                <a href={hubPreview.url} target="_blank" rel="noreferrer">
                  {hubPreview.url}
                </a>
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
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onAdd} disabled={loading}>
            {loading ? "Connecting..." : "Connect"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>
      </FocusTrap>
    </div>
  );
}
