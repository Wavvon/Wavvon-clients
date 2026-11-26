import { useState } from "react";
import { useTranslation } from "react-i18next";
import { passphraseStrength } from "../../utils/passphraseStrength";
import { IdentityModal } from "./IdentityModal";

/**
 * Exporting one identity to an encrypted .wavvon-backup file: a passphrase,
 * typed twice. The app does the writing (web downloads, desktop encrypts and
 * saves in Rust so the key never reaches the renderer).
 */
export function ExportIdentityModal({ label, onExport, onClose }: {
  /** The account's name, for the title. */
  label: string;
  onExport: (passphrase: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = passphrase ? passphraseStrength(passphrase) : null;

  async function submit() {
    if (!passphrase) { setError(t("settings.account.full_archive.error_empty")); return; }
    if (passphrase !== confirm) { setError(t("settings.account.full_archive.error_mismatch")); return; }
    setWorking(true);
    setError(null);
    try {
      await onExport(passphrase);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <IdentityModal label={t("settings.account.identity_backup.export_title", { label })} onClose={onClose}>
      <div className="export-identity">
        <h2>{t("settings.account.identity_backup.export_title", { label })}</h2>
        <p className="muted">{t("settings.account.identity_backup.export_hint")}</p>
        <input
          type="password"
          autoFocus
          placeholder={t("settings.account.full_archive.passphrase")}
          aria-label={t("settings.account.full_archive.passphrase")}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        {strength && (
          <span className={`passphrase-strength ${strength}`}>
            {t("settings.account.full_archive.strength", { strength: t(`settings.account.full_archive.strength_${strength}`) })}
          </span>
        )}
        {strength === "weak" && <p className="export-identity-warning">{t("settings.account.identity_backup.weak_warning")}</p>}
        <input
          type="password"
          placeholder={t("settings.account.full_archive.confirm_passphrase")}
          aria-label={t("settings.account.full_archive.confirm_passphrase")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        />
        {error && <p className="error-text">{error}</p>}
        <div className="export-identity-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>{t("modal.cancel")}</button>
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={working}>
            {working ? t("settings.account.full_archive.exporting") : t("settings.account.identity_backup.save_button")}
          </button>
        </div>
      </div>
    </IdentityModal>
  );
}
