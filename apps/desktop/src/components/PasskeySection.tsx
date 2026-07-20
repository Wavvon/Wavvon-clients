import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Passkey management (view / rename / delete; registration is web-only).
interface CredentialInfo {
  id: string;
  friendly_name: string | null;
  aaguid: string | null;
  created_at: number;
  last_used_at: number | null;
}

export function PasskeySection({ hubId }: { hubId: string | null }) {
  const [passkeys, setPasskeys] = useState<CredentialInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!hubId) return;
    invoke<CredentialInfo[]>("passkey_list", { hubId })
      .then(setPasskeys)
      .catch((e: unknown) => setError(String(e)));
  }, [hubId]);

  async function handleDelete(id: string) {
    if (!hubId) return;
    setError(null);
    try {
      await invoke("passkey_delete", { hubId, credentialId: id });
      setPasskeys((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  async function handleRename(id: string) {
    if (!hubId) return;
    setError(null);
    try {
      await invoke("passkey_rename", { hubId, credentialId: id, friendlyName: renameValue.trim() });
      setRenamingId(null);
      setPasskeys(await invoke("passkey_list", { hubId }));
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  if (!hubId) return null;

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Passkeys</label>
      <p className="muted" style={{ marginBottom: 12 }}>
        Passkeys registered for this hub. To add a new passkey, open the hub in the web client and go to Account → Passkeys.
      </p>
      {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>{error}</p>}
      {passkeys === null ? (
        <p className="muted">Loading…</p>
      ) : passkeys.length === 0 ? (
        <p className="muted">No passkeys registered.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(pk.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
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
    </div>
  );
}
