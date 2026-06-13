import { useState, useRef } from "react";

interface Props {
  publicKey: string | null;
  onExported?: () => void;
  onImported?: () => void;
}

export function IdentityBackupSection({ publicKey, onExported, onImported }: Props) {
  const [step, setStep] = useState<"idle" | "export-form" | "import-form" | "import-conflict">("idle");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [exportLabel, setExportLabel] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importFileData, setImportFileData] = useState<string | null>(null);
  const [importFilename, setImportFilename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function passphraseStrength(p: string): "weak" | "fair" | "strong" {
    if (p.length < 8) return "weak";
    if (p.length < 14) return "fair";
    return "strong";
  }

  async function handleExport() {
    if (exportPassphrase !== exportConfirm) { setError("Passphrases don't match."); return; }
    if (!exportPassphrase) { setError("Enter a passphrase."); return; }
    setWorking(true);
    setError(null);
    try {
      const identityJson = localStorage.getItem("voxply_identity");
      if (!identityJson) throw new Error("No identity found.");

      const enc = new TextEncoder();
      const saltArr = crypto.getRandomValues(new Uint8Array(16));
      const nonceArr = crypto.getRandomValues(new Uint8Array(12));
      const salt = saltArr.buffer as ArrayBuffer;
      const nonce = nonceArr.buffer as ArrayBuffer;
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
        enc.encode(identityJson).buffer as ArrayBuffer,
      );

      const envelope = {
        format: "voxply-backup",
        version: 1,
        kdf: { alg: "pbkdf2-sha256", salt: bufToBase64(saltArr.buffer as ArrayBuffer), iterations: 100000 },
        cipher: { alg: "aes-256-gcm", nonce: bufToBase64(nonceArr.buffer as ArrayBuffer), ciphertext: bufToBase64(ciphertext) },
        created_at: Math.floor(Date.now() / 1000),
        label: exportLabel || null,
      };

      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const short = publicKey?.slice(0, 8) ?? "identity";
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voxply-identity-${short}-${date}.voxply-backup`;
      a.click();
      URL.revokeObjectURL(url);

      setStep("idle");
      setExportPassphrase("");
      setExportConfirm("");
      setExportLabel("");
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
      const envelope = JSON.parse(importFileData) as {
        format: string; version: number;
        kdf: { alg: string; salt: string; iterations: number };
        cipher: { alg: string; nonce: string; ciphertext: string };
      };
      if (envelope.format !== "voxply-backup") throw new Error("Not a Voxply backup file.");
      if (envelope.version !== 1) throw new Error("This backup was made by a newer version of Voxply.");

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
      const identity = JSON.parse(identityJson) as { seed_hex?: string };
      if (!identity.seed_hex) throw new Error("Invalid backup content.");

      const existing = localStorage.getItem("voxply_identity");
      if (existing) {
        const existingId = JSON.parse(existing) as { seed_hex?: string };
        if (existingId.seed_hex === identity.seed_hex) {
          setError("This backup is the identity already on this device. Nothing to do.");
          return;
        }
        if (!confirm(`This device already has a different Voxply identity (${existingId.seed_hex?.slice(0, 8)}…). Replace it?\n\nMake sure that identity is backed up first.`)) {
          return;
        }
      }

      localStorage.setItem("voxply_identity", identityJson);
      setStep("idle");
      setImportPassphrase("");
      setImportFileData(null);
      setImportFilename("");
      onImported?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="settings-label">Identity backup</label>
      <p className="muted">
        Export your identity to an encrypted file. Anyone with the file and passphrase
        can become you — store it safely and never share the passphrase.
      </p>

      {step === "idle" && (
        <div className="settings-row">
          <button className="btn-secondary" onClick={() => { setStep("export-form"); setError(null); }}>
            Export backup
          </button>
          <button className="btn-secondary" onClick={() => { setStep("import-form"); setError(null); }}>
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
            <button className="btn-secondary" onClick={() => { setStep("idle"); setError(null); }}>
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
            accept=".voxply-backup,application/json"
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
