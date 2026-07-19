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
  /** True once the invite's `?fp=`/`#fp=` fingerprint was verified against the hub's /info (lan-mode.md §5). */
  fingerprintMatch?: boolean;
  onAdd: () => void;
  onAddWithPasskey?: () => void;
  onClose: () => void;
}

export function AddHubModal({ hubUrl, onHubUrlChange, hubPreview, inviteCode, onInviteCodeChange, loading, error, fingerprintMatch, onAdd, onAddWithPasskey, onClose }: Props) {
  const { t } = useTranslation();
  const [copiedInvite, setCopiedInvite] = useState(false);
  const showPasskey = !!onAddWithPasskey && hubPreview.state === "ok" && isPasskeySupported();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-hub-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="add-hub-title">{t("hub.add_modal.title")}</h3>
        <p className="muted" style={{ marginBottom: "var(--space-3)" }} dangerouslySetInnerHTML={{ __html: t("hub.add_modal.intro") }} />
        <input
          type="text"
          value={hubUrl}
          onChange={(e) => onHubUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
            if (e.key === "Escape") onClose();
          }}
          placeholder={t("hub.add_modal.url_placeholder")}
          autoFocus
        />
        {hubPreview.state === "loading" && (
          <p className="muted hub-preview-status">{t("welcome.looking_up")}</p>
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
                ⚙️ {t("welcome.pow_required")}{" "}
                {(hubPreview.min_security_level ?? 0) >= 20
                  ? t("welcome.pow_high")
                  : (hubPreview.min_security_level ?? 0) >= 15
                  ? t("welcome.pow_medium")
                  : t("welcome.pow_low")}
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
        {fingerprintMatch && (
          <p className="muted hub-preview-status">{t("hub.add_modal.fingerprint_match")}</p>
        )}
        <div className="modal-actions">
          <button onClick={onClose} className="btn-secondary">{t("modal.cancel")}</button>
          <button onClick={onAdd} disabled={loading}>
            {loading ? t("hub.connecting") : t("hub.add_modal.connect")}
          </button>
        </div>
        {showPasskey && (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)", display: "block", marginBottom: 6 }}>{t("hub.add_modal.or_divider")}</span>
            <button
              className="btn-secondary"
              style={{ width: "100%" }}
              onClick={onAddWithPasskey}
              disabled={loading}
            >
              {t("hub.add_modal.passkey_signin")}
            </button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
      </FocusTrap>
    </div>
  );
}
