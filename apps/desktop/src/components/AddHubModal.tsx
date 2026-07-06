import React from "react";
import { useTranslation } from "react-i18next";
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
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onClose: () => void;
  onBrowse?: () => void;
}

export function AddHubModal({ hubUrl, onHubUrlChange, hubPreview, loading, error, onAdd, onClose, onBrowse }: Props) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-hub-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="add-hub-title">{t("hub.add.button")}</h3>
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
              {t("hub.reachable")}
            </p>
            {hubPreview.invite_only && (
              <p className="muted hub-preview-warn">
                🔒 {t("hub.invite_only_hint")}
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
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">{t("modal.cancel")}</button>
          <button onClick={onAdd} disabled={loading}>
            {loading ? t("hub.connecting") : t("hub.add.button")}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {onBrowse && (
          <p style={{ marginTop: "var(--space-3)", textAlign: "center" }}>
            <button className="btn-secondary" onClick={onBrowse} style={{ fontSize: "0.875em" }}>
              Browse public hubs
            </button>
          </p>
        )}
      </div>
      </FocusTrap>
    </div>
  );
}
