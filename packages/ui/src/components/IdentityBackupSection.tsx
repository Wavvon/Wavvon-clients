import { useState } from "react";
import { useTranslation } from "react-i18next";
import { encryptBackup, decryptBackup, suggestBackupFilename, type BackupAccount } from "@wavvon/core";
import { passphraseStrength } from "../utils/passphraseStrength";

export interface IdentityBackupAccount {
  id: string;
  label: string;
  /** Web only — the raw secret key material already lives in this device's
   *  IndexedDB, so web encrypts client-side. Desktop never puts a secret key
   *  in the renderer; its export goes through `exportToPath` instead, which
   *  does the whole read+encrypt+write in Rust given just the account id. */
  secretKeyHex?: string;
}

export interface IdentityBackupSectionActions {
  /** Web: deliver the encrypted backup's raw bytes to the platform (triggers
   *  a blob download). Paired with `pickFile`/`importAccount`. */
  saveFile?: (bytes: Uint8Array, filename: string) => void | Promise<void>;
  /** Web: prompt the user to choose a backup file; null if they cancel. */
  pickFile?: () => Promise<Uint8Array | null>;
  /** Web: persist the decrypted account locally. `isNew: false` means this
   *  identity was already on the device — nothing was added. */
  importAccount?: (account: BackupAccount) => Promise<{ isNew: boolean }>;

  /** Desktop: opens a native save dialog and does the whole encrypt+write in
   *  Rust (the secret key never enters the renderer). Takes precedence over
   *  saveFile/pickFile/importAccount when provided. */
  exportToPath?: (accountId: string, passphrase: string) => Promise<void>;
  /** Desktop: opens a native file-open dialog, returning the chosen path (or
   *  null if cancelled) — paired with importFromPath. */
  pickImportPath?: () => Promise<string | null>;
  /** Desktop: decrypts and creates the account in Rust given just the file
   *  path (never reads the ciphertext into JS). */
  importFromPath?: (path: string, passphrase: string) => Promise<{ isNew: boolean }>;
}

interface Props {
  accounts: IdentityBackupAccount[];
  recoveryPhrase: string | null;
  onRevealPhrase: () => void;
  actions: IdentityBackupSectionActions;
}

interface ExportForm {
  account: IdentityBackupAccount;
  passphrase: string;
  confirm: string;
}

// Phrase-first: the 24-word recovery phrase (rendered above) is the canonical
// backup and works on any device. The encrypted `.wavvon-backup` file below
// is a secondary, one-account-per-file affordance — export several accounts
// as several files (settings-ia.md §4a).
export function IdentityBackupSection({ accounts, recoveryPhrase, onRevealPhrase, actions }: Props) {
  const { t } = useTranslation();
  const [exportForm, setExportForm] = useState<ExportForm | null>(null);
  const [importing, setImporting] = useState(false);
  const [importBytes, setImportBytes] = useState<Uint8Array | null>(null);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [importPassphrase, setImportPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  function startExport(account: IdentityBackupAccount) {
    setExportForm({ account, passphrase: "", confirm: "" });
    setError(null);
    setNotice(null);
  }

  async function handleExport() {
    if (!exportForm) return;
    const { account, passphrase, confirm } = exportForm;
    if (passphrase !== confirm) { setError(t("settings.account.full_archive.error_mismatch")); return; }
    if (!passphrase) { setError(t("settings.account.full_archive.error_empty")); return; }
    setWorking(true);
    setError(null);
    try {
      if (actions.exportToPath) {
        // Desktop: Rust reads the identity, encrypts, and writes the file —
        // the secret key never enters the renderer.
        await actions.exportToPath(account.id, passphrase);
      } else {
        if (!account.secretKeyHex || !actions.saveFile) throw new Error("export_unavailable");
        const envelope = await encryptBackup({ label: account.label, secret_key_hex: account.secretKeyHex }, passphrase);
        const bytes = new TextEncoder().encode(JSON.stringify(envelope));
        await actions.saveFile(bytes, suggestBackupFilename(account.label));
      }
      setExportForm(null);
      setNotice(t("settings.account.identity_backup.export_success"));
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function startImport() {
    setError(null);
    setNotice(null);
    if (actions.pickImportPath) {
      const path = await actions.pickImportPath();
      if (!path) return;
      setImportPath(path);
    } else {
      if (!actions.pickFile) return;
      const bytes = await actions.pickFile();
      if (!bytes) return;
      setImportBytes(bytes);
    }
    setImportPassphrase("");
    setImporting(true);
  }

  async function handleImportSubmit() {
    if (!importBytes && !importPath) return;
    setWorking(true);
    setError(null);
    try {
      let result: { isNew: boolean };
      if (importPath && actions.importFromPath) {
        result = await actions.importFromPath(importPath, importPassphrase);
      } else if (importBytes && actions.importAccount) {
        const text = new TextDecoder().decode(importBytes);
        const account = await decryptBackup(text, importPassphrase);
        result = await actions.importAccount(account);
      } else {
        throw new Error("import_unavailable");
      }
      setImporting(false);
      setImportBytes(null);
      setImportPath(null);
      setImportPassphrase("");
      setNotice(
        result.isNew
          ? t("settings.account.identity_backup.import_success")
          : t("settings.account.identity_backup.already_present"),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        message === "unsupported_backup_format"
          ? t("settings.account.identity_backup.error_unsupported")
          : t("settings.account.identity_backup.error_decrypt"),
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      <div className="settings-section">
        <label className="settings-label">{t("settings.security.recovery.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.security.recovery.hint")}
        </p>
        {recoveryPhrase ? (
          <div
            className="recovery-phrase"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 14px", fontFamily: "monospace", lineHeight: 1.8, fontSize: "var(--text-sm)" }}
          >
            {recoveryPhrase}
          </div>
        ) : (
          <button className="btn-secondary" onClick={onRevealPhrase}>
            {t("settings.security.recovery.reveal")}
          </button>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">{t("settings.account.identity_backup.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.account.identity_backup.file_is_secondary")}
        </p>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.account.identity_backup.hint")}
        </p>

        {notice && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{notice}</p>}

        {accounts.map((account) => (
          <div key={account.id} className="settings-row">
            <span>{account.label}</span>
            <button className="btn-secondary" onClick={() => startExport(account)}>
              {t("settings.account.identity_backup.export_button")}
            </button>
          </div>
        ))}

        {exportForm && (
          <div>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {t("settings.account.identity_backup.export_hint")}
            </p>
            <input
              type="password"
              placeholder={t("settings.account.full_archive.passphrase")}
              aria-label={t("settings.account.full_archive.passphrase")}
              value={exportForm.passphrase}
              onChange={(e) => setExportForm({ ...exportForm, passphrase: e.target.value })}
              style={{ width: "100%", marginBottom: 4 }}
            />
            {exportForm.passphrase && (
              <span className={`passphrase-strength ${passphraseStrength(exportForm.passphrase)}`}>
                {t("settings.account.full_archive.strength", { strength: t(`settings.account.full_archive.strength_${passphraseStrength(exportForm.passphrase)}`) })}
              </span>
            )}
            {passphraseStrength(exportForm.passphrase) === "weak" && exportForm.passphrase && (
              <p className="muted" style={{ color: "var(--warning, orange)", fontSize: "var(--text-xs)" }}>
                {t("settings.account.identity_backup.weak_warning")}
              </p>
            )}
            <input
              type="password"
              placeholder={t("settings.account.full_archive.confirm_passphrase")}
              aria-label={t("settings.account.full_archive.confirm_passphrase")}
              value={exportForm.confirm}
              onChange={(e) => setExportForm({ ...exportForm, confirm: e.target.value })}
              style={{ width: "100%", margin: "4px 0 8px" }}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="settings-row">
              <button onClick={handleExport} disabled={working}>
                {working ? t("settings.account.full_archive.exporting") : t("settings.account.identity_backup.save_button")}
              </button>
              <button className="btn-secondary" onClick={() => { setExportForm(null); setError(null); }}>
                {t("modal.cancel")}
              </button>
            </div>
          </div>
        )}

        {!exportForm && !importing && (
          <div className="settings-row" style={{ marginTop: 8 }}>
            <button className="btn-secondary" onClick={startImport}>
              {t("settings.account.identity_backup.restore_button")}
            </button>
          </div>
        )}

        {importing && (
          <div>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {t("settings.account.identity_backup.import_hint")}
            </p>
            <input
              type="password"
              placeholder={t("settings.account.full_archive.passphrase")}
              aria-label={t("settings.account.full_archive.passphrase")}
              value={importPassphrase}
              onChange={(e) => setImportPassphrase(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="settings-row">
              <button onClick={handleImportSubmit} disabled={working || !importPassphrase}>
                {working ? t("settings.account.identity_backup.restoring") : t("settings.account.identity_backup.restore_now")}
              </button>
              <button className="btn-secondary" onClick={() => { setImporting(false); setImportBytes(null); setImportPath(null); setError(null); }}>
                {t("modal.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
