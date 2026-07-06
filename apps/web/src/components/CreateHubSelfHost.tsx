import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";

interface Props {
  discoveryNewUrl: string;
  setupCommand: string;
  inviteValue: string;
  onInviteChange: (v: string) => void;
  inviteLoading: boolean;
  inviteError: string | null;
  onRedeemInvite: () => void;
  onBack?: () => void;
  onClose: () => void;
}

export function CreateHubSelfHost({
  discoveryNewUrl,
  setupCommand,
  inviteValue,
  onInviteChange,
  inviteLoading,
  inviteError,
  onRedeemInvite,
  onBack,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [copiedCommand, setCopiedCommand] = useState(false);

  function copyCommand() {
    navigator.clipboard.writeText(setupCommand).catch(() => {});
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-hub-title"
          style={{ maxWidth: 560, width: "100%" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="create-hub-title">{t("create_hub.title")}</h3>
          <p className="muted">{t("create_hub.intro")}</p>

          <div className="settings-section">
            <label className="settings-label">{t("create_hub.web.label")}</label>
            <p className="muted">{t("create_hub.web.hint")}</p>
            <a
              className="btn-secondary"
              style={{ display: "inline-block", textDecoration: "none" }}
              href={discoveryNewUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("create_hub.web.action")}
            </a>
          </div>

          <div className="settings-section">
            <label className="settings-label">{t("create_hub.cli.label")}</label>
            <p className="muted">{t("create_hub.cli.hint")}</p>
            <div className="alliance-share-code-row">
              <code className="alliance-share-code">{setupCommand}</code>
              <button className="btn-secondary" onClick={copyCommand} title={t("modal.copy")}>
                {copiedCommand ? t("modal.copied") : t("modal.copy")}
              </button>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label" htmlFor="create-hub-invite">
              {t("create_hub.invite.label")}
            </label>
            <p className="muted">{t("create_hub.invite.hint")}</p>
            <div className="settings-row">
              <input
                id="create-hub-invite"
                type="text"
                value={inviteValue}
                onChange={(e) => onInviteChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRedeemInvite();
                }}
                placeholder="wavvon://hub.example.com/i/serial/code"
              />
              <button onClick={onRedeemInvite} disabled={inviteLoading || !inviteValue}>
                {inviteLoading ? t("create_hub.invite.joining") : t("create_hub.invite.join")}
              </button>
            </div>
            {inviteError && <p className="error-text">{inviteError}</p>}
          </div>

          <div className="modal-actions">
            {onBack && (
              <button className="btn-secondary" onClick={onBack}>
                {t("modal.back")}
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
