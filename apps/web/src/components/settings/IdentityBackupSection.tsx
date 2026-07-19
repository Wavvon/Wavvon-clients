import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  listAccounts,
  listAccountsOrdered,
  getActiveAccountId,
  resolveOrCreateAccount,
  switchAccount,
  SWITCH_BLOCKED_COOLDOWN,
  type IdentityRecord,
} from "@identity/index";
import { formatPubkey } from "@wavvon/core";
import {
  validateBackupEnvelopeMeta,
  parseBackupPayload,
  suggestBackupFilename,
  type BackupEnvelopeMeta,
} from "@shared/utils/identityBackupPayload";
import { encryptBackup } from "@shared/utils/backupCrypto";
import { passphraseStrength } from "@shared/utils/passphraseStrength";

interface Props {
  publicKey: string | null;
  onExported?: () => void;
  onImported?: () => void;
}

interface ImportSummary {
  added: number;
  alreadyPresent: number;
}

export function IdentityBackupSection({ publicKey, onExported, onImported }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<"idle" | "export-form" | "import-form">("idle");
  const [exportAccounts, setExportAccounts] = useState<IdentityRecord[] | null>(null);
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [exportLabel, setExportLabel] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importFileData, setImportFileData] = useState<string | null>(null);
  const [importFilename, setImportFilename] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // switchAccount refuses (voice guard, switch cooldown) rather than always
  // succeeding — surface that the same way every other failure here does.
  function switchOrShowError(accountId: string) {
    const refused = switchAccount(accountId, "settings-account");
    if (refused) {
      setError(refused === SWITCH_BLOCKED_COOLDOWN ? t("settings.account.accounts.switch_cooldown") : refused);
    }
  }

  function openExportForm() {
    setStep("export-form");
    setError(null);
    listAccountsOrdered().then((accounts) => {
      setExportAccounts(accounts);
      const activeId = getActiveAccountId();
      setExportSelectedIds(new Set(activeId ? [activeId] : accounts.map((a) => a.id).slice(0, 1)));
    });
  }

  function toggleExportSelection(id: string) {
    setExportSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllForExport() {
    setExportSelectedIds(new Set((exportAccounts ?? []).map((a) => a.id)));
  }

  async function handleExport() {
    if (exportPassphrase !== exportConfirm) { setError(t("settings.account.full_archive.error_mismatch")); return; }
    if (!exportPassphrase) { setError(t("settings.account.full_archive.error_empty")); return; }
    const accounts = exportAccounts ?? [];
    const selected = accounts.length > 1 ? accounts.filter((a) => exportSelectedIds.has(a.id)) : accounts;
    if (selected.length === 0) {
      setError(accounts.length > 1 ? t("settings.account.identity_backup.error_select_account") : t("settings.account.identity_backup.error_no_identity"));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const blob = await encryptBackup(selected, exportPassphrase, exportLabel || null);
      const url = URL.createObjectURL(blob);
      const filename = suggestBackupFilename(selected, new Date());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStep("idle");
      setExportPassphrase("");
      setExportConfirm("");
      setExportLabel("");
      setExportAccounts(null);
      setExportSelectedIds(new Set());
      onExported?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportFileData(ev.target?.result as string);
      setError(null);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!importFileData || !importPassphrase) { setError(t("settings.account.identity_backup.error_missing_file")); return; }
    setWorking(true);
    setError(null);
    try {
      const envelope = JSON.parse(importFileData) as BackupEnvelopeMeta & {
        kdf: { alg: string; salt: string; iterations: number };
        cipher: { alg: string; nonce: string; ciphertext: string };
      };
      validateBackupEnvelopeMeta(envelope);

      const enc = new TextEncoder();
      const saltBuf = base64ToBuf(envelope.kdf.salt);
      const nonceBuf = base64ToBuf(envelope.cipher.nonce);
      const ciphertextBuf = base64ToBuf(envelope.cipher.ciphertext);

      const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(importPassphrase).buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]);
      const aesKey = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltBuf.buffer as ArrayBuffer, iterations: envelope.kdf.iterations, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );

      let plaintext: ArrayBuffer;
      try {
        plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonceBuf.buffer as ArrayBuffer }, aesKey, ciphertextBuf.buffer as ArrayBuffer);
      } catch {
        throw new Error(t("settings.account.identity_backup.error_decrypt"));
      }

      const identityJson = new TextDecoder().decode(plaintext);
      const records = parseBackupPayload(identityJson);

      const priorAccounts = await listAccounts();
      const hadAnyAccountBefore = priorAccounts.length > 0;

      const added: IdentityRecord[] = [];
      let alreadyPresent = 0;
      for (const record of records) {
        const { account, isNew } = await resolveOrCreateAccount(record.seed_hex, {
          master_pubkey: record.master_pubkey,
          device_label: record.device_label,
          subkey_cert: record.subkey_cert,
          account_label: record.account_label,
        });
        if (isNew) added.push(account);
        else alreadyPresent++;
      }

      setStep("idle");
      setImportPassphrase("");
      setImportFileData(null);
      setImportFilename("");
      onImported?.();

      if (added.length === 0) {
        setImportSummary({ added: 0, alreadyPresent });
        return;
      }

      const first = added[0];
      if (!hadAnyAccountBefore) {
        switchOrShowError(first.id);
        return;
      }
      if (
        confirm(
          t("settings.account.identity_backup.import_confirm", { count: added.length, alreadyPresent }),
        )
      ) {
        switchOrShowError(first.id);
      } else {
        setImportSummary({ added: added.length, alreadyPresent });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  const showExportCheckboxes = (exportAccounts?.length ?? 0) > 1;

  return (
    <div className="settings-section">
      <label className="settings-label">{t("settings.account.identity_backup.label")}</label>
      <p className="muted">
        {t("settings.account.identity_backup.hint")}
      </p>

      {step === "idle" && importSummary && (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.account.identity_backup.import_complete", { added: importSummary.added, alreadyPresent: importSummary.alreadyPresent })}
        </p>
      )}

      {step === "idle" && (
        <div className="settings-row">
          <button className="btn-secondary" onClick={openExportForm}>
            {t("settings.account.identity_backup.export_button")}
          </button>
          <button className="btn-secondary" onClick={() => { setStep("import-form"); setError(null); setImportSummary(null); }}>
            {t("settings.account.identity_backup.restore_button")}
          </button>
        </div>
      )}

      {step === "export-form" && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.account.identity_backup.export_hint")}
          </p>
          {showExportCheckboxes && (
            <div style={{ marginBottom: 8 }}>
              <div className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("settings.account.identity_backup.accounts_include")}</span>
                <button type="button" className="btn-small btn-secondary" onClick={selectAllForExport}>
                  {t("settings.account.identity_backup.select_all")}
                </button>
              </div>
              {(exportAccounts ?? []).map((account) => (
                <label key={account.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={exportSelectedIds.has(account.id)}
                    onChange={() => toggleExportSelection(account.id)}
                  />
                  {account.account_label || formatPubkey(account.id)}
                </label>
              ))}
            </div>
          )}
          <input
            type="password"
            placeholder={t("settings.account.full_archive.passphrase")}
            aria-label={t("settings.account.full_archive.passphrase")}
            value={exportPassphrase}
            onChange={(e) => setExportPassphrase(e.target.value)}
            style={{ width: "100%", marginBottom: 4 }}
          />
          {exportPassphrase && (
            <span className={`passphrase-strength ${passphraseStrength(exportPassphrase)}`}>
              {t("settings.account.full_archive.strength", { strength: t(`settings.account.full_archive.strength_${passphraseStrength(exportPassphrase)}`) })}
            </span>
          )}
          {passphraseStrength(exportPassphrase) === "weak" && exportPassphrase && (
            <p className="muted" style={{ color: "var(--warning, orange)", fontSize: "var(--text-xs)" }}>
              {t("settings.account.identity_backup.weak_warning")}
            </p>
          )}
          <input
            type="password"
            placeholder={t("settings.account.full_archive.confirm_passphrase")}
            aria-label={t("settings.account.full_archive.confirm_passphrase")}
            value={exportConfirm}
            onChange={(e) => setExportConfirm(e.target.value)}
            style={{ width: "100%", margin: "4px 0" }}
          />
          <input
            type="text"
            placeholder={t("settings.account.identity_backup.label_field_placeholder")}
            aria-label={t("settings.account.identity_backup.label_field_aria")}
            value={exportLabel}
            onChange={(e) => setExportLabel(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="settings-row">
            <button onClick={handleExport} disabled={working}>
              {working ? t("settings.account.full_archive.exporting") : t("settings.account.identity_backup.save_button")}
            </button>
            <button className="btn-secondary" onClick={() => { setStep("idle"); setError(null); setExportAccounts(null); }}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}

      {step === "import-form" && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.account.identity_backup.import_hint")}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wavvon-backup,application/json"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <div className="settings-row" style={{ marginBottom: 8 }}>
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              {t("settings.account.identity_backup.choose_file")}
            </button>
            {importFilename && <span className="muted">{importFilename}</span>}
          </div>
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
            <button onClick={handleImport} disabled={working || !importFileData}>
              {working ? t("settings.account.identity_backup.restoring") : t("settings.account.identity_backup.restore_now")}
            </button>
            <button className="btn-secondary" onClick={() => { setStep("idle"); setError(null); }}>
              {t("modal.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
