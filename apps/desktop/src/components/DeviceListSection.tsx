import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PairedDevice } from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";

export function DeviceListSection() {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeStatus, setRevokeStatus] = useState<Record<string, "revoking" | "revoked">>({});

  useEffect(() => {
    invoke<PairedDevice[]>("device_list").then(setDevices).catch(() => setDevices([])).finally(() => setLoading(false));
  }, []);

  async function handleRevoke(pubkey: string) {
    setRevokeStatus((prev) => ({ ...prev, [pubkey]: "revoking" }));
    try {
      await invoke("device_revoke", { pubkey });
      setRevokeStatus((prev) => ({ ...prev, [pubkey]: "revoked" }));
      setDevices((prev) => prev.filter((d) => d.subkey_pubkey !== pubkey));
    } catch {
      setRevokeStatus((prev) => { const next = { ...prev }; delete next[pubkey]; return next; });
    }
  }

  if (loading) return <p className="muted">Loading devices…</p>;

  if (devices.length === 0) {
    return (
      <div className="settings-section">
        <p className="muted">No paired devices. Use the pairing flow below to link another device.</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      {devices.map((d) => (
        <div key={d.subkey_pubkey} className="settings-row" style={{ marginBottom: 8, padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" }}>
          <div>
            <strong>{d.device_label}</strong>
            {d.is_this_device && <span className="muted" style={{ marginLeft: 8 }}>(this device)</span>}
            <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {formatPubkey(d.subkey_pubkey)} · added {formatRelative(d.issued_at)}
            </div>
          </div>
          {!d.is_this_device && (
            <button
              className="btn-secondary"
              style={{ color: "var(--color-error, red)" }}
              onClick={() => handleRevoke(d.subkey_pubkey)}
              disabled={revokeStatus[d.subkey_pubkey] === "revoking"}
            >
              {revokeStatus[d.subkey_pubkey] === "revoking" ? "Revoking…" : "Revoke"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
