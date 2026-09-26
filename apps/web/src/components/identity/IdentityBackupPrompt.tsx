import { useTranslation } from "react-i18next";
import { FocusTrap } from "@wavvon/ui";

interface Props {
  onShowPhrase: () => void;
  onLater: () => void;
}

// Shown once, after the first message an identity with no saved copy sends.
// The 24 words mean nothing on the way in — at that moment there is nothing to
// lose, which is exactly when nobody writes them down. They mean something
// here, and this is the only place the flow interrupts anyone.
//
// "Later" is a real answer: it leaves the marker on the settings gear rather
// than making the reminder disappear, which is the difference between this and
// a toast.
export function IdentityBackupPrompt({ onShowPhrase, onLater }: Props) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onLater}>
      <FocusTrap>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="identity-backup-prompt-title"
          style={{ maxWidth: 460 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="identity-backup-prompt-title">{t("identity_backup.prompt.title")}</h3>
          <p className="muted" style={{ marginBottom: "var(--space-4)" }}>{t("identity_backup.prompt.body")}</p>
          <div className="modal-actions" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn-primary" onClick={onShowPhrase}>
              {t("identity_backup.prompt.show_phrase")}
            </button>
            <button className="btn-secondary" onClick={onLater}>
              {t("identity_backup.prompt.later")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
