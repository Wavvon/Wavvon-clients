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
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "done" | string>("idle");

  const strength = passphraseStrength(passphrase);
  const mismatch = confirm.length > 0 && passphrase !== confirm;
  const canExport = passphrase.length >= 8 && passphrase === confirm;

  async function handleExport() {
    if (!canExport) return;
    setExporting(true);
    setExportStatus("idle");
    try {
      await invoke("export_identity_backup", { passphrase });
      setExportStatus("done");
      setPassphrase("");
      setConfirm("");
    } catch (e) {
      setExportStatus(String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="settings-label">Export identity backup</label>
      <p className="muted">
        Creates a <code>.voxply-backup</code> file encrypted with your passphrase.
        Store it in a safe place (password manager, USB, cloud drive).
      </p>
      <div style={{ marginTop: 8 }}>
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>Passphrase</label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Choose a strong passphrase"
          style={{ marginBottom: 4 }}
        />
        {passphrase.length > 0 && (
          <div className={`passphrase-strength strength-${strength.score}`} style={{ fontSize: "var(--text-xs)", marginBottom: 4 }}>
            Strength: {strength.label}
            {strength.score < 2 && (
              <span className="muted"> — use at least 12 characters and a mix of letters, numbers, symbols</span>
            )}
          </div>
        )}
        <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>Confirm passphrase</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat passphrase"
        />
        {mismatch && <p className="error-text" style={{ marginTop: 4 }}>Passphrases do not match.</p>}
      </div>
      <div className="settings-row" style={{ marginTop: 8 }}>
        <button onClick={handleExport} disabled={!canExport || exporting}>
          {exporting ? "Exporting…" : "Export backup"}
        </button>
        {exportStatus === "done" && <span className="muted">Backup saved.</span>}
        {exportStatus !== "idle" && exportStatus !== "done" && (
          <span className="error-text">{exportStatus}</span>
        )}
      </div>
    </div>
  );
}
