import { useState, useRef } from "react";
import {
  listAccounts,
  getActiveAccountId,
  resolveOrCreateAccount,
  switchAccount,
  type IdentityRecord,
} from "@identity/index";
import { formatPubkey } from "@wavvon/core";
import {
  BACKUP_FORMAT,
  BACKUP_ENVELOPE_VERSION,
  validateBackupEnvelopeMeta,
  serializeBackupPayload,
  parseBackupPayload,
  suggestBackupFilename,
  type BackupEnvelopeMeta,
} from "@shared/utils/identityBackupPayload";

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

  function passphraseStrength(p: string): "weak" | "fair" | "strong" {
    if (p.length < 8) return "weak";
    if (p.length < 14) return "fair";
    return "strong";
  }

  function openExportForm() {
    setStep("export-form");
    setError(null);
    listAccounts().then((accounts) => {
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
    if (exportPassphrase !== exportConfirm) { setError("Passphrases don't match."); return; }
    if (!exportPassphrase) { setError("Enter a passphrase."); return; }
    const accounts = exportAccounts ?? [];
    const selected = accounts.length > 1 ? accounts.filter((a) => exportSelectedIds.has(a.id)) : accounts;
    if (selected.length === 0) {
      setError(accounts.length > 1 ? "Select at least one account to export." : "No identity found.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const payloadJson = serializeBackupPayload(selected);

      const enc = new TextEncoder();
      const saltArr = crypto.getRandomValues(new Uint8Array(16));
      const nonceArr = crypto.getRandomValues(new Uint8Array(12));
      const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(exportPassphrase).buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]);
      const aesKey = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: saltArr, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"],
      );
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonceArr },
        aesKey,
        enc.encode(payloadJson).buffer as ArrayBuffer,
      );

      const envelope = {
        format: BACKUP_FORMAT,
        version: BACKUP_ENVELOPE_VERSION,
        kdf: { alg: "pbkdf2-sha256", salt: bufToBase64(saltArr.buffer as ArrayBuffer), iterations: 100000 },
        cipher: { alg: "aes-256-gcm", nonce: bufToBase64(nonceArr.buffer as ArrayBuffer), ciphertext: bufToBase64(ciphertext) },
        created_at: Math.floor(Date.now() / 1000),
        label: exportLabel || null,
      };

      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
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
    if (!importFileData || !importPassphrase) { setError("Select a file and enter the passphrase."); return; }
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
        throw new Error("Couldn't unlock — wrong passphrase or the file is damaged.");
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
        switchAccount(first.id);
        return;
      }
      if (
        confirm(
          `Import added ${added.length} new identit${added.length === 1 ? "y" : "ies"}` +
            (alreadyPresent > 0 ? ` (${alreadyPresent} already on this device).` : ".") +
            "\n\nSwitch to the first new identity now?\n\nMake sure the current identity is backed up first.",
        )
      ) {
        switchAccount(first.id);
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
      <label className="settings-label">Identity backup</label>
      <p className="muted">
        Export your identity to an encrypted file. Anyone with the file and passphrase
        can become you — store it safely and never share the passphrase.
      </p>

      {step === "idle" && importSummary && (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Import complete: {importSummary.added} added, {importSummary.alreadyPresent} already on this device.
        </p>
      )}

      {step === "idle" && (
        <div className="settings-row">
          <button className="btn-secondary" onClick={openExportForm}>
            Export backup
          </button>
          <button className="btn-secondary" onClick={() => { setStep("import-form"); setError(null); setImportSummary(null); }}>
            Restore from backup
          </button>
        </div>
      )}

      {step === "export-form" && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Create a passphrase-protected backup of your identity. This file plus your
            passphrase restores your identity on any device.
          </p>
          {showExportCheckboxes && (
            <div style={{ marginBottom: 8 }}>
              <div className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Accounts to include</span>
                <button type="button" className="btn-small btn-secondary" onClick={selectAllForExport}>
                  Select all
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
            placeholder="Passphrase"
            aria-label="Export passphrase"
            value={exportPassphrase}
            onChange={(e) => setExportPassphrase(e.target.value)}
            style={{ width: "100%", marginBottom: 4 }}
          />
          {exportPassphrase && (
            <span className={`passphrase-strength ${passphraseStrength(exportPassphrase)}`}>
              Strength: {passphraseStrength(exportPassphrase)}
            </span>
          )}
          {passphraseStrength(exportPassphrase) === "weak" && exportPassphrase && (
            <p className="muted" style={{ color: "var(--warning, orange)", fontSize: "var(--text-xs)" }}>
              Weak passphrase — a strong passphrase is your primary defense if this file is stolen.
            </p>
          )}
          <input
            type="password"
            placeholder="Confirm passphrase"
            aria-label="Confirm export passphrase"
            value={exportConfirm}
            onChange={(e) => setExportConfirm(e.target.value)}
            style={{ width: "100%", margin: "4px 0" }}
          />
          <input
            type="text"
            placeholder="Label (optional, e.g. laptop backup May 2026)"
            aria-label="Backup label"
            value={exportLabel}
            onChange={(e) => setExportLabel(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="settings-row">
            <button onClick={handleExport} disabled={working}>
              {working ? "Exporting…" : "Save backup file"}
            </button>
            <button className="btn-secondary" onClick={() => { setStep("idle"); setError(null); setExportAccounts(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "import-form" && (
        <div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            If you still have a working device, pair it instead of importing a backup.
            Import only when recovering from total device loss.
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
              Choose file
            </button>
            {importFilename && <span className="muted">{importFilename}</span>}
          </div>
          <input
            type="password"
            placeholder="Passphrase"
            aria-label="Import passphrase"
            value={importPassphrase}
            onChange={(e) => setImportPassphrase(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="settings-row">
            <button onClick={handleImport} disabled={working || !importFileData}>
              {working ? "Restoring…" : "Restore"}
            </button>
            <button className="btn-secondary" onClick={() => { setStep("idle"); setError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
