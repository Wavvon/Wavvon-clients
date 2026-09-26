import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

interface DeviceInfo {
  id: string;
  device_name: string | null;
  created_at: number;
  expires_at: number;
  last_used_at: number | null;
}

export function TrustedDevicesSection({ hubId }: { hubId: string | null }) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hubId) return;
    invoke<DeviceInfo[]>("trusted_device_list", { hubId })
      .then(setDevices)
      .catch((e: unknown) => setError(String(e)));
  }, [hubId]);

  async function handleRevoke(id: string) {
    if (!hubId) return;
    setError(null);
    try {
      await invoke("trusted_device_revoke", { hubId, deviceId: id });
      setDevices((prev) => prev?.filter((d) => d.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  if (!hubId) return null;

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">{t("settings.account.trusted_devices.label")}</label>
      <p className="muted" style={{ marginBottom: 12 }}>
        {t("settings.account.trusted_devices.hint")}
      </p>
      {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>{error}</p>}
      {devices === null ? (
        <p className="muted">{t("modal.loading")}</p>
      ) : devices.length === 0 ? (
        <p className="muted">{t("settings.account.trusted_devices.empty")}</p>
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
                {d.device_name ?? t("settings.account.trusted_devices.unnamed")}
              </span>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {t("settings.account.trusted_devices.expires", {
                  date: new Date(d.expires_at * 1000).toLocaleDateString(),
                })}
              </span>
              <button
                className="btn-secondary"
                style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                onClick={() => handleRevoke(d.id)}
              >
                {t("settings.account.revoke_button")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
