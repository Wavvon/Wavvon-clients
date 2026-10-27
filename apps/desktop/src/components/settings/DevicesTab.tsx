import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@wavvon/ui";
import { DeviceListSection } from "../DeviceListSection";
import { PairingSection } from "../PairingSection";
import type { Hub } from "../../types";

interface Props {
  hubs: Hub[];
}

// What can act as this device's active account: paired devices (subkey
// certs), then pairing.
// Passkeys live with recovery on Manage accounts.
// Unlike web, there's no cross-account "managing" selector here yet — every
// section below is scoped to whichever account/hub is currently active,
// matching the Tauri commands backing them (settings-ia.md piece 3 gap).
export function DevicesTab({ hubs }: Props) {
  const { t } = useTranslation();
  const [pairingOpen, setPairingOpen] = useState(false);

  return (
    <section>
      <h1>{t("settings.tabs.devices")}</h1>
      <DeviceListSection />
      <SettingRow
        title={t("settings.devices.pairing.title")}
        state={t("settings.devices.pairing.state")}
        open={pairingOpen}
        onToggle={() => setPairingOpen((v) => !v)}
      >
        <p className="muted">{t("settings.devices.pairing.hint")}</p>
        <PairingSection hubs={hubs} />
      </SettingRow>
    </section>
  );
}
