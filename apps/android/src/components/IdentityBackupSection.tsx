import React, { useRef, useState } from "react";

interface Props {
  onExportBackup: (passphrase: string, label: string) => Promise<string>;
  onImportBackup: (fileContent: string, passphrase: string) => Promise<"same" | "replaced" | "conflict">;
}

function passphraseStrength(pw: string): "weak" | "fair" | "strong" {
  if (pw.length < 8) return "weak";
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  const variety = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
  if (pw.length >= 16 && variety >= 3) return "strong";
  if (pw.length >= 10 && variety >= 2) return "fair";
  return "weak";
}

export function IdentityBackupSection({ onExportBackup, onImportBackup }: Props) {
  const [exportPhrase, setExportPhrase] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [exportLabel, setExportLabel] = useState("");
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "done" | "error">("idle");
  const [exportError, setExportError] = useState("");
  const [exportLink, setExportLink] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPhrase, setImportPhrase] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "done" | "conflict" | "error">("idle");
  const [importError, setImportError] = useState("");
  const [conflictContent, setConflictContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const strength = passphraseStrength(exportPhrase);

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    if (!exportPhrase || exportPhrase !== exportConfirm) return;
    setExportStatus("exporting");
    setExportError("");
    try {
      const dataUrl = await onExportBackup(exportPhrase, exportLabel);
      setExportLink(dataUrl);
      setExportStatus("done");
    } catch (err) {
      setExportError(String(err));
      setExportStatus("error");
    }
  }

  function triggerDownload() {
    if (!exportLink) return;
    const a = document.createElement("a");
    a.href = exportLink;
    a.download = `wavvon-identity-backup.wavvon-backup`;
    a.click();
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile || !importPhrase) return;
    setImportStatus("importing");
    setImportError("");
    try {
      const text = await importFile.text();
      const result = await onImportBackup(text, importPhrase);
      if (result === "conflict") {
        setConflictContent(text);
        setImportStatus("conflict");
      } else {
        setImportStatus("done");
      }
    } catch (err) {
      setImportError(String(err));
      setImportStatus("error");
    }
  }

  async function confirmReplace() {
    setImportStatus("importing");
    try {
      await onImportBackup(conflictContent, importPhrase);
      setImportStatus("done");
    } catch (err) {
      setImportError(String(err));
      setImportStatus("error");
    }
  }

  return (
    <div className="identity-backup-section">
      <div className="settings-section">
        <label className="settings-label">Back up your identity</label>
        <p className="muted">
          This file plus your passphrase can restore your identity on any device.
          Anyone with both can become you — store the file somewhere safe and never share the passphrase.
        </p>
        <form onSubmit={handleExport}>
          <input
            type="password"
            value={exportPhrase}
            onChange={(e) => setExportPhrase(e.target.value)}
            placeholder="Passphrase"
            aria-label="Export passphrase"
            autoComplete="new-password"
            style={{ marginBottom: 6 }}
          />
          <input
            type="password"
            value={exportConfirm}
            onChange={(e) => setExportConfirm(e.target.value)}
            placeholder="Confirm passphrase"
            aria-label="Confirm export passphrase"
            autoComplete="new-password"
            style={{ marginBottom: 6 }}
          />
          {exportPhrase && (
            <p className={`passphrase-strength strength-${strength}`}>
              Strength: {strength}
              {strength === "weak" && " — consider using a longer passphrase."}
            </p>
          )}
          {exportPhrase && exportConfirm && exportPhrase !== exportConfirm && (
            <p className="error-text">Passphrases do not match.</p>
          )}
          <input
            type="text"
            value={exportLabel}
            onChange={(e) => setExportLabel(e.target.value)}
            placeholder="Label (optional, e.g. phone backup 2026)"
            aria-label="Backup label"
            style={{ marginBottom: 8 }}
          />
          {exportError && <p className="error-text">{exportError}</p>}
          {exportStatus === "done" && (
            <div>
              <p className="muted">Backup ready. Save it somewhere safe.</p>
              <button type="button" className="btn-primary" onClick={triggerDownload}>Download backup file</button>
            </div>
          )}
          {exportStatus !== "done" && (
            <button
              type="submit"
              className="btn-primary"
              disabled={exportStatus === "exporting" || !exportPhrase || exportPhrase !== exportConfirm}
            >
              {exportStatus === "exporting" ? "Exporting…" : "Export backup"}
            </button>
          )}
        </form>
      </div>

      <div className="settings-section">
        <label className="settings-label">Restore from backup</label>
        <p className="muted">Only use this to recover on a new device if you have no working device left. If you have a working device, use device pairing instead.</p>
        <form onSubmit={handleImport}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wavvon-backup"
            style={{ marginBottom: 6 }}
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          <input
            type="password"
            value={importPhrase}
            onChange={(e) => setImportPhrase(e.target.value)}
            placeholder="Passphrase"
            aria-label="Import passphrase"
            autoComplete="current-password"
            style={{ marginBottom: 8 }}
          />
          {importError && <p className="error-text">{importError}</p>}
          {importStatus === "done" && <p className="muted">Identity restored successfully.</p>}
          {importStatus === "conflict" && (
            <div className="import-conflict">
              <p className="muted">
                This device already has a different Wavvon identity.
                Replacing it means this device stops being that identity.
                Make sure that identity is backed up first.
              </p>
              <button type="button" className="btn-danger" onClick={confirmReplace}>Replace identity</button>
              <button type="button" className="btn-secondary" onClick={() => setImportStatus("idle")} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          )}
          {importStatus !== "done" && importStatus !== "conflict" && (
            <button
              type="submit"
              className="btn-secondary"
              disabled={importStatus === "importing" || !importFile || !importPhrase}
            >
              {importStatus === "importing" ? "Restoring…" : "Restore backup"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
