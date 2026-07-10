import { useState, useEffect } from "react";
import {
  isPasskeySupported,
  registerPasskey,
  listPasskeys,
  deletePasskey,
  renamePasskey,
} from "@platform";
import type { CredentialInfo } from "@platform";

// Passkey management (Settings → Account): list, register, rename, remove.
// Passkeys are tied to a specific hub — registration targets the active one.
export function PasskeySection({ publicKey }: { publicKey: string | null }) {
  const [passkeys, setPasskeys] = useState<CredentialInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const supported = isPasskeySupported();

  useEffect(() => {
    if (!publicKey) return;
    listPasskeys()
      .then(setPasskeys)
      .catch((e: unknown) => setError(String(e)));
  }, [publicKey]);

  async function handleAdd() {
    if (!publicKey) return;
    setRegistering(true);
    setError(null);
    try {
      await registerPasskey(publicKey, undefined, newKeyName.trim() || undefined);
      setNewKeyName("");
      setPasskeys(await listPasskeys());
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setRegistering(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deletePasskey(id);
      setPasskeys((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  async function handleRename(id: string) {
    setError(null);
    try {
      await renamePasskey(id, renameValue.trim());
      setRenamingId(null);
      setPasskeys(await listPasskeys());
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  if (!supported) {
    return (
      <div className="settings-section" style={{ marginTop: 20 }}>
        <label className="settings-label">Passkeys</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          Your browser doesn&apos;t support passkeys.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Passkeys</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
        Sign in with your device&apos;s biometrics or PIN instead of your recovery phrase. Passkeys are tied to a specific hub — register one while logged in.
      </p>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {error}
        </p>
      )}
      {passkeys === null ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>Loading…</p>
      ) : (
        <>
          {passkeys.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
              No passkeys registered yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                    padding: "8px 10px",
                    background: "var(--bg-elevated)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  {renamingId === pk.id ? (
                    <>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        style={{ flex: 1, fontSize: "var(--text-sm)" }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(pk.id); if (e.key === "Escape") setRenamingId(null); }}
                      />
                      <button className="btn-primary" style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }} onClick={() => handleRename(pk.id)}>Save</button>
                      <button className="btn-secondary" style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }} onClick={() => setRenamingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>
                        {pk.friendly_name ?? "Unnamed passkey"}
                      </span>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {pk.last_used_at
                          ? `Used ${new Date(pk.last_used_at * 1000).toLocaleDateString()}`
                          : `Added ${new Date(pk.created_at * 1000).toLocaleDateString()}`}
                      </span>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                        onClick={() => { setRenamingId(pk.id); setRenameValue(pk.friendly_name ?? ""); }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                        onClick={() => handleDelete(pk.id)}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Passkey name (optional)"
              style={{ width: 200 }}
            />
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={registering || !publicKey}
            >
              {registering ? "Registering…" : "Add passkey"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
