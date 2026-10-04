import { useEffect, useState } from "react";
import { SettingRow } from "@wavvon/ui";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { formatDate } from "@wavvon/core";

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
  const [open, setOpen] = useState(false);

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
    <SettingRow
      title={t("settings.account.trusted_devices.label")}
      state={devices === null
        ? t("modal.loading")
        : devices.length === 0
          ? t("settings.account.trusted_devices.empty")
          : t("settings.account.trusted_devices.state", { count: devices.length })}
      meta={devices && devices.length > 0 ? String(devices.length) : undefined}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <p className="muted">{t("settings.account.trusted_devices.hint")}</p>
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
                  date: formatDate(d.expires_at),
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
    </SettingRow>
  );
}