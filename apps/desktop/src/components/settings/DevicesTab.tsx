import { useTranslation } from "react-i18next";
import { DeviceListSection } from "../DeviceListSection";
import { PairingSection } from "../PairingSection";
import { PasskeySection } from "../PasskeySection";
import { TrustedDevicesSection } from "../TrustedDevicesSection";
import type { Hub } from "../../types";

interface Props {
  hubs: Hub[];
  activeHubId: string | null;
}

// What can act as this device's active account: paired devices (subkey
// certs) and pairing, then hub-scoped passkeys/trusted-device tokens.
// Unlike web, there's no cross-account "managing" selector here yet — every
// section below is scoped to whichever account/hub is currently active,
// matching the Tauri commands backing them (settings-ia.md piece 3 gap).
export function DevicesTab({ hubs, activeHubId }: Props) {
  const { t } = useTranslation();

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.devices")}</h1>
      <DeviceListSection />
      <h2 className="settings-subheading">{t("settings.devices.pairing.title")}</h2>
      <p className="muted">{t("settings.devices.pairing.hint")}</p>
      <PairingSection hubs={hubs} />
      {activeHubId && <PasskeySection hubId={activeHubId} />}
      {activeHubId && <TrustedDevicesSection hubId={activeHubId} />}
    </section>
  );
}
