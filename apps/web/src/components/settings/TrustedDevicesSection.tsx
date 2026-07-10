import { useState, useEffect } from "react";
import { listTrustedDevices, revokeTrustedDevice } from "@platform";
import type { DeviceInfo } from "@platform";

// Trusted-device list (Settings → Account): devices holding long-lived
// access to the active hub, with per-device revoke.
export function TrustedDevicesSection() {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrustedDevices()
      .then(setDevices)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await revokeTrustedDevice(id);
      setDevices((prev) => prev?.filter((d) => d.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">Trusted devices</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
        Devices that have been granted long-lived access to this hub. Revoke any device you no longer recognise.
      </p>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {error}
        </p>
      )}
      {devices === null ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>Loading…</p>
      ) : devices.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>No trusted devices.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {devices.map((d) => (
            <li
              key={d.id}
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
              <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>
                {d.device_name ?? "Unnamed device"}
              </span>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Expires {new Date(d.expires_at * 1000).toLocaleDateString()}
              </span>
              <button
                className="btn-secondary"
                style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                onClick={() => handleRevoke(d.id)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
