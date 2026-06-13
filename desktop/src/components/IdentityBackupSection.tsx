import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function passphraseStrength(p: string): { score: number; label: string } {
  let score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 20) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^a-zA-Z0-9]/.test(p)) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"];
  return { score, label: labels[score] ?? "Very strong" };
}

export function IdentityBackupSection() {
  // Export state
  const [exportPass, setExportPass] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "done" | string>("idle");

  // Import state
  const [importPass, setImportPass] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "done" | string>("idle");

  const strength = passphraseStrength(exportPass);
  const mismatch = exportConfirm.length > 0 && exportPass !== exportConfirm;
  const canExport = exportPass.length >= 8 && exportPass === exportConfirm;
  const canImport = importPass.length > 0 && importPath.trim().length > 0;

  async function handleExport() {
    if (!canExport) return;
    setExporting(true);
    setExportStatus("idle");
    try {
      const savedPath = await invoke<string>("export_identity_backup", {
        passphrase: exportPass,
      });
      setExportStatus(`done:${savedPath}`);
      setExportPass("");
      setExportConfirm("");
    } catch (e) {
      setExportStatus(String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!canImport) return;
    const confirmed = window.confirm(
      "This will replace your current identity with the backup. " +
        "Make sure you have your passphrase correct. Continue?"
    );
    if (!confirmed) return;
    setImporting(true);
    setImportStatus("idle");
    try {
      await invoke("import_identity_backup", {
        passphrase: importPass,
        srcPath: importPath.trim(),
      });
      setImportStatus("done");
      setImportPass("");
      setImportPath("");
    } catch (e) {
      setImportStatus(String(e));
    } finally {
      setImporting(false);
    }
  }

  const exportSavedPath =
    exportStatus.startsWith("done:") ? exportStatus.slice(5) : null;

  return (
    <div>
      {/* Export section */}
      <div className="settings-section">
        <label className="settings-label">Identity backup</label>
        <p className="muted">
          Export your identity to an encrypted file you can restore from if you
          lose your device. Keep this file and your passphrase safe — anyone
          with both can take over your identity.
        </p>
        <div style={{ marginTop: 8 }}>
          <label className="settings-label" htmlFor="export-passphrase" style={{ fontSize: "var(--text-sm)" }}>
            Passphrase
          </label>
          <input
            id="export-passphrase"
            type="password"
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
            placeholder="Choose a strong passphrase"
            style={{ marginBottom: 4 }}
          />
          {exportPass.length > 0 && (
            <div
              className={`passphrase-strength strength-${strength.score}`}
              style={{ fontSize: "var(--text-xs)", marginBottom: 4 }}
            >
              Strength: {strength.label}
              {strength.score < 2 && (
                <span className="muted">
                  {" "}
                  — use at least 12 characters and a mix of letters, numbers,
                  symbols
                </span>
              )}
            </div>
          )}
          <label className="settings-label" htmlFor="export-passphrase-confirm" style={{ fontSize: "var(--text-sm)" }}>
            Confirm passphrase
          </label>
          <input
            id="export-passphrase-confirm"
            type="password"
            value={exportConfirm}
            onChange={(e) => setExportConfirm(e.target.value)}
            placeholder="Repeat passphrase"
          />
          {mismatch && (
            <p className="error-text" style={{ marginTop: 4 }}>
              Passphrases do not match.
            </p>
          )}
        </div>
        <div className="settings-row" style={{ marginTop: 8 }}>
          <button onClick={handleExport} disabled={!canExport || exporting}>
            {exporting ? "Exporting…" : "Export backup"}
          </button>
          {exportSavedPath && (
            <span className="muted" style={{ wordBreak: "break-all" }}>
              Saved to: <code>{exportSavedPath}</code>
            </span>
          )}
          {exportStatus !== "idle" &&
            !exportStatus.startsWith("done") && (
              <span className="error-text">{exportStatus}</span>
            )}
        </div>
      </div>

      {/* Import section */}
      <div className="settings-section">
        <label className="settings-label">Restore from backup</label>
        <p className="muted">
          Paste the full path to a <code>.voxback</code> file and enter its
          passphrase to restore your identity on this device. This overwrites
          your current identity.
        </p>
        <div style={{ marginTop: 8 }}>
          <label className="settings-label" htmlFor="import-backup-path" style={{ fontSize: "var(--text-sm)" }}>
            Backup file path
          </label>
          <input
            id="import-backup-path"
            type="text"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder="/home/you/.voxply/identity-backup-....voxback"
            style={{ marginBottom: 4 }}
          />
          <label className="settings-label" htmlFor="import-passphrase" style={{ fontSize: "var(--text-sm)" }}>
            Passphrase
          </label>
          <input
            id="import-passphrase"
            type="password"
            value={importPass}
            onChange={(e) => setImportPass(e.target.value)}
            placeholder="Backup passphrase"
          />
        </div>
        <div className="settings-row" style={{ marginTop: 8 }}>
          <button onClick={handleImport} disabled={!canImport || importing}>
            {importing ? "Restoring…" : "Restore from backup"}
          </button>
          {importStatus === "done" && (
            <span className="muted">
              Identity restored. Restart the app to reconnect.
            </span>
          )}
          {importStatus !== "idle" && importStatus !== "done" && (
            <span className="error-text">{importStatus}</span>
          )}
        </div>
      </div>
    </div>
  );
}
