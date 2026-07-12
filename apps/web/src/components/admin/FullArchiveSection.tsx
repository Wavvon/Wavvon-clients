import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { assembleArchive } from "@shared/utils/dataExport";
import { encryptArchive, decryptArchive } from "@shared/utils/archiveCrypto";
import {
  parseArchiveDocument,
  planRestore,
  readExistingAccountSnapshot,
  applyRestorePlan,
  totalRestored,
  totalSkipped,
  type ArchiveIdentityInput,
  type RestoreSummary,
} from "@shared/utils/archiveRestore";
import { listAccounts, resolveOrCreateAccount, switchAccount, type SubkeyCert } from "@identity/index";

interface Props {
  publicKey: string | null;
}

function passphraseStrength(p: string): "weak" | "fair" | "strong" {
  if (p.length < 8) return "weak";
  if (p.length < 14) return "fair";
  return "strong";
}

type Mode = "idle" | "export" | "restore";

export function FullArchiveSection({ publicKey }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("idle");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [restoreFileData, setRestoreFileData] = useState<string | null>(null);
  const [restoreFilename, setRestoreFilename] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  const open = mode === "export";

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

      setMode("idle");
      setPassphrase("");
      setConfirm("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  function handleRestoreFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRestoreFileData(ev.target?.result as string);
      setError(null);
    };
    reader.readAsText(file);
  }

  async function handleRestore() {
    if (!restoreFileData || !restorePassphrase) {
      setError(t("settings.account.full_archive.error_missing_file"));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const json = await decryptArchive(restoreFileData, restorePassphrase);
      const archive = parseArchiveDocument(json);

      const priorAccounts = await listAccounts();
      const hadAnyAccountBefore = priorAccounts.length > 0;

      const identityInput = archive.identity as unknown as ArchiveIdentityInput;
      const { account } = await resolveOrCreateAccount(identityInput.seed_hex, {
        master_pubkey: identityInput.master_pubkey,
        device_label: identityInput.device_label,
        subkey_cert: identityInput.subkey_cert as SubkeyCert | undefined,
        account_label: identityInput.account_label,
      });

      const existing = readExistingAccountSnapshot(account.id);
      const plan = planRestore(archive, existing);
      applyRestorePlan(account.id, plan);

      setMode("idle");
      setRestorePassphrase("");
      setRestoreFileData(null);
      setRestoreFilename("");
      setRestoreSummary(plan.summary);

      if (!hadAnyAccountBefore) {
        switchAccount(account.id, "settings-account", t("settings.account.accounts.switching"));
        return;
      }
      if (
        window.confirm(
          t("settings.account.full_archive.restore_switch_confirm", {
            restored: totalRestored(plan.summary),
            skipped: totalSkipped(plan.summary),
          }),
        )
      ) {
        switchAccount(account.id, "settings-account", t("settings.account.accounts.switching"));
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.account.full_archive.label")}</label>
      <p className="muted">{t("settings.account.full_archive.hint")}</p>

      {mode === "idle" && restoreSummary && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.account.full_archive.restore_complete", {
              restored: totalRestored(restoreSummary),
              skipped: totalSkipped(restoreSummary),
            })}
          </p>
          {restoreSummary.unrestorable.map((note, i) => (
            <p key={i} className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {note}
            </p>
          ))}
        </div>
      )}

      {mode === "idle" && (
        <div className="settings-row">
          <button className="btn-secondary" disabled={!publicKey} onClick={() => { setMode("export"); setError(null); }}>
            {t("settings.account.full_archive.open_button")}
          </button>
          <button className="btn-secondary" onClick={() => { setMode("restore"); setError(null); setRestoreSummary(null); }}>
            {t("settings.account.full_archive.restore_button")}
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
            <button className="btn-secondary" onClick={() => { setMode("idle"); setError(null); }} disabled={working}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}

      {mode === "restore" && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.account.full_archive.restore_hint")}
          </p>
          <input
            ref={restoreFileInputRef}
            type="file"
            accept=".json.enc,application/octet-stream,application/json"
            onChange={handleRestoreFileSelect}
            style={{ display: "none" }}
          />
          <div className="settings-row" style={{ marginBottom: 8 }}>
            <button className="btn-secondary" onClick={() => restoreFileInputRef.current?.click()}>
              {t("settings.account.identity_backup.choose_file")}
            </button>
            {restoreFilename && <span className="muted">{restoreFilename}</span>}
          </div>
          <input
            type="password"
            placeholder={t("settings.account.full_archive.passphrase")}
            aria-label={t("settings.account.full_archive.passphrase")}
            value={restorePassphrase}
            onChange={(e) => setRestorePassphrase(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="settings-row">
            <button onClick={handleRestore} disabled={working || !restoreFileData}>
              {working ? t("settings.account.identity_backup.restoring") : t("settings.account.identity_backup.restore_now")}
            </button>
            <button className="btn-secondary" onClick={() => { setMode("idle"); setError(null); }} disabled={working}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
