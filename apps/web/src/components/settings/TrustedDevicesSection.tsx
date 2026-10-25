import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listTrustedDevices, revokeTrustedDevice, isNotMemberError } from "@platform";
import type { DeviceInfo } from "@platform";
import { getActiveAccountId, type IdentityRecord } from "@identity/index";
import { SettingRow } from "@wavvon/ui";
import { formatDate } from "@wavvon/core";

interface Props {
  account: IdentityRecord;
}

// Trusted-device list (Settings → Account): devices holding long-lived
// access to whichever account is selected in AccountTab's "Managing"
// selector, with per-device revoke. For the active account this is the
// existing active-session-scoped list; for any other on-device account it
// routes through hubFetchAs (platform/hubFetchAs.ts) to fetch a token for
// that account without switching into it.
export function TrustedDevicesSection({ account }: Props) {
  const { t } = useTranslation();
  const accountLabel = account.account_label ?? null;
  const isActive = account.id === getActiveAccountId();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noActiveHub, setNoActiveHub] = useState(false);
  const [notMember, setNotMember] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDevices(null);
    setError(null);
    setNoActiveHub(false);
    setNotMember(false);
    listTrustedDevices(isActive ? undefined : account)
      .then(setDevices)
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === "No active hub") {
          setNoActiveHub(true);
        } else if (isNotMemberError(e)) {
          setNotMember(true);
        } else {
          setError(String(e));
        }
      });
  }, [account, isActive]);

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await revokeTrustedDevice(id, isActive ? undefined : account);
      setDevices((prev) => prev?.filter((d) => d.id !== id) ?? null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  // What this row says it is set to, in order of what blocks it: no hub to
  // ask, not a member of the one we have, still loading, then the count.
  const state = noActiveHub
    ? t("settings.account.trusted_devices.no_active_hub")
    : notMember
      ? t("settings.account.not_member_notice", { label: accountLabel ?? t("settings.account.this_account_label") })
      : devices === null
        ? t("modal.loading")
        : devices.length === 0
          ? t("settings.account.trusted_devices.empty")
          : t("settings.account.trusted_devices.state", { count: devices.length });

  return (
    <SettingRow
      title={t("settings.account.trusted_devices.label")}
      state={state}
      meta={devices && devices.length > 0 ? String(devices.length) : undefined}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <p className="muted">{t("settings.account.trusted_devices.hint")}</p>
      {error && <p className="error-text">{error}</p>}
      {devices && devices.length > 0 && (
        <ul className="device-list">
          {devices.map((d) => (
            <li key={d.id} className="device-list-item">
              <span style={{ flex: 1 }}>
                {d.device_name ?? t("settings.account.trusted_devices.unnamed")}
              </span>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {t("settings.account.trusted_devices.expires", { date: formatDate(d.expires_at) })}
              </span>
              <button className="btn-small" onClick={() => handleRevoke(d.id)}>
                {t("settings.account.revoke_button")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingRow>
  );
}
