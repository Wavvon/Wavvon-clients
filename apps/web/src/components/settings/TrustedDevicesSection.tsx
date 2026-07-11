import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listTrustedDevices, revokeTrustedDevice } from "@platform";
import type { DeviceInfo } from "@platform";
import { AccountLabelSuffix, PerAccountHint } from "@wavvon/ui";
import { useActiveAccountLabel } from "@shared/hooks/useActiveAccountLabel";

// Trusted-device list (Settings → Account): devices holding long-lived
// access to the active hub, with per-device revoke. The list comes from the
// active hub session, which is per-account (activeSession() reads an
// account-scoped token), so it's already scoped correctly.
export function TrustedDevicesSection() {
  const { t } = useTranslation();
  const accountLabel = useActiveAccountLabel();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noActiveHub, setNoActiveHub] = useState(false);

  useEffect(() => {
    listTrustedDevices()
      .then(setDevices)
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === "No active hub") {
          setNoActiveHub(true);
        } else {
          setError(String(e));
        }
      });
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

  if (noActiveHub) {
    return (
      <div className="settings-section" style={{ marginTop: 20 }}>
        <label className="settings-label">
          {t("settings.account.trusted_devices.label")}
          <AccountLabelSuffix label={accountLabel} />
        </label>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.account.trusted_devices.no_active_hub")}
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">
        {t("settings.account.trusted_devices.label")}
        <AccountLabelSuffix label={accountLabel} />
      </label>
      <PerAccountHint label={accountLabel} />
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
        {t("settings.account.trusted_devices.hint")}
      </p>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {error}
        </p>
      )}
      {devices === null ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("modal.loading")}</p>
      ) : devices.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.account.trusted_devices.empty")}</p>
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
                {t("settings.account.trusted_devices.expires", { date: new Date(d.expires_at * 1000).toLocaleDateString() })}
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
