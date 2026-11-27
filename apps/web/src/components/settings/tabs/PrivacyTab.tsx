import { useTranslation } from "react-i18next";
import type { BlockEntry } from "@shared/types";
import { AccountBlockedUsersSection } from "../AccountBlockedUsersSection";
import type { PerAccountProps } from "@wavvon/ui";
import type { IdentityRecord } from "@identity/index";

interface Props extends PerAccountProps<IdentityRecord> {
  blocks: BlockEntry[];
  onUnblock: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
}

// Who the selected account has blocked — about other people,
// unlike Devices (what can access the account), hence its own area.
export function PrivacyTab(props: Props) {
  const { t } = useTranslation();

  return (
    <section>
      <h1>{t("settings.tabs.privacy")}</h1>
      {props.managing && (
        <AccountBlockedUsersSection
          account={props.managing}
          activeBlocks={props.blocks}
          onUnblockActive={props.onUnblock}
          knownNames={props.knownNames}
        />
      )}
    </section>
  );
}
