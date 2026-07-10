import { useState } from "react";
import { useTranslation } from "react-i18next";
import { assembleArchive } from "@shared/utils/dataExport";
import { encryptArchive } from "@shared/utils/archiveCrypto";

interface Props {
  publicKey: string | null;
}

function passphraseStrength(p: string): "weak" | "fair" | "strong" {
  if (p.length < 8) return "weak";
  if (p.length < 14) return "fair";
  return "strong";
}

export function FullArchiveSection({ publicKey }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleExport() {
    if (passphrase !== confirm) {
      setError(t("settings.account.full_archive.error_mismatch"));
      return;
    }
    if (!passphrase) {
      setError(t("settings.account.full_archive.error_empty"));
      return;
    }
    setWorking(true);
    setError(null);
    setProgress(null);
    try {
      const archive = await assembleArchive({
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const json = JSON.stringify(archive, null, 2);
      const blob = await encryptArchive(json, passphrase);

      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wavvon-archive-${date}.json.enc`;
      a.click();
      URL.revokeObjectURL(url);

      setOpen(false);
      setPassphrase("");
      setConfirm("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.account.full_archive.label")}</label>
      <p className="muted">{t("settings.account.full_archive.hint")}</p>

      {!open && (
        <div className="settings-row">
          <button className="btn-secondary" disabled={!publicKey} onClick={() => { setOpen(true); setError(null); }}>
            {t("settings.account.full_archive.open_button")}
          </button>
        </div>
      )}

      {open && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)", color: "var(--warning)" }}>
            {t("settings.account.full_archive.warning")}
          </p>
          <input
            type="password"
            placeholder={t("settings.account.full_archive.passphrase")}
            aria-label={t("settings.account.full_archive.passphrase")}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            style={{ width: "100%", marginBottom: 4 }}
          />
          {passphrase && (
            <span className={`passphrase-strength ${passphraseStrength(passphrase)}`}>
              {t("settings.account.full_archive.strength", { strength: t(`settings.account.full_archive.strength_${passphraseStrength(passphrase)}`) })}
            </span>
          )}
          <input
            type="password"
            placeholder={t("settings.account.full_archive.confirm_passphrase")}
            aria-label={t("settings.account.full_archive.confirm_passphrase")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", margin: "4px 0 8px" }}
          />
          {progress && (
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {t("settings.account.full_archive.progress", { done: progress.done, total: progress.total })}
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="settings-row">
            <button onClick={handleExport} disabled={working}>
              {working ? t("settings.account.full_archive.exporting") : t("settings.account.full_archive.export_button")}
            </button>
            <button className="btn-secondary" onClick={() => { setOpen(false); setError(null); }} disabled={working}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
