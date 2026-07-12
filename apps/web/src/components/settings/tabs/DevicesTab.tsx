import { useTranslation } from "react-i18next";
import type { Hub } from "@shared/types";
import { DevicesSection } from "../DevicesSection";
import { PasskeySection } from "../PasskeySection";
import { TrustedDevicesSection } from "../TrustedDevicesSection";
import { ManagingAccountSelector } from "../ManagingAccountSelector";
import type { PerAccountProps } from "./perAccount";

interface Props extends PerAccountProps {
  hubs: Hub[];
  publicKey: string | null;
}

// What can act as the selected account, and how to revoke it: paired devices
// (subkey certs), passkeys, and trusted-device tokens, side by side.
export function DevicesTab(props: Props) {
  const { t } = useTranslation();
  const activeHubUrl = props.hubs.find((h) => h.is_active)?.hub_url;

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.devices")}</h1>
      {props.accounts && props.managing && (
        <ManagingAccountSelector
          accounts={props.accounts}
          activeId={props.activeId}
          selectedId={props.managing.id}
          onChange={props.onManagingChange}
        />
      )}
      {props.managing && <DevicesSection activeHubUrl={activeHubUrl} account={props.managing} />}
      {props.managing && <PasskeySection publicKey={props.publicKey} account={props.managing} />}
      {props.managing && <TrustedDevicesSection account={props.managing} />}
    </section>
  );
}
