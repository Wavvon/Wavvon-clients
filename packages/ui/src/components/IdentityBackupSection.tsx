import { useTranslation } from "react-i18next";

interface Props {
  recoveryPhrase: string | null;
  onRevealPhrase: () => void;
  /** The active identity has never left this browser — no phrase revealed, no
   *  backup exported. Someone who joined from an invite link starts here,
   *  because that flow does not show the phrase on the way in. */
  needsBackup?: boolean;
  /** A paired device: what it holds is its own subkey, so there is no phrase
   *  here to reveal — 24 words of the subkey would restore a different
   *  identity. The phrase lives on the device it was paired from. */
  phraseHeldElsewhere?: boolean;
}

/**
 * The active identity's recovery phrase, the backup that works anywhere. The
 * encrypted file is per account, under Export in the account list, and
 * restoring either one is Add account.
 */
export function IdentityBackupSection({ recoveryPhrase, onRevealPhrase, needsBackup, phraseHeldElsewhere }: Props) {
  const { t } = useTranslation();
  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.security.recovery.label")}</label>
      {needsBackup && (
        <p className="error-text" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.account.identity_backup.only_copy")}
        </p>
      )}
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
        {t("settings.security.recovery.hint")}
      </p>
      {phraseHeldElsewhere ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.security.recovery.paired_device")}
        </p>
      ) : recoveryPhrase ? (
        <div className="recovery-phrase">
          {recoveryPhrase.split(/\s+/).filter(Boolean).map((word, i) => (
            <span key={`${i}-${word}`}>{word}</span>
          ))}
        </div>
      ) : (
        <button className="btn-secondary" onClick={onRevealPhrase}>
          {t("settings.security.recovery.reveal")}
        </button>
      )}
    </div>
  );
}
