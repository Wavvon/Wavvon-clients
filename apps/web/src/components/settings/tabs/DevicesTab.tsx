import { useTranslation } from "react-i18next";
import type { Hub } from "@shared/types";
import { DevicesSection } from "../DevicesSection";
import type { PerAccountProps } from "@wavvon/ui";
import type { IdentityRecord } from "@identity/index";

interface Props extends PerAccountProps<IdentityRecord> {
  hubs: Hub[];
  publicKey: string | null;
}

// What can act as the selected account, and how to revoke it: its paired
// devices (subkey certs).
// Passkeys live with recovery on Manage accounts: they are a way back in to
// one hub, not a device of the identity.
export function DevicesTab(props: Props) {
  const { t } = useTranslation();
  const activeHubUrl = props.hubs.find((h) => h.is_active)?.hub_url;

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.devices")}</h1>
      {props.managing && (
        <DevicesSection activeHubUrl={activeHubUrl} account={props.managing} />
      )}
    </section>
  );
}
