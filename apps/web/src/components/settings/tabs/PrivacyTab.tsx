import { useTranslation } from "react-i18next";
import type { BlockEntry, Hub, IgnoreEntry } from "@shared/types";
import { AccountBlockIgnoreSection } from "../AccountBlockIgnoreSection";
import type { PerAccountProps, TrustRoot } from "@wavvon/ui";
import { TrustedIssuersSection, knownIssuerHubs } from "@wavvon/ui";
import { lookupIssuerHub } from "../../../platform/adminActions";
import type { IdentityRecord } from "@identity/index";

interface Props extends PerAccountProps<IdentityRecord> {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  trustRoots: TrustRoot[];
  onTrustRootsChange: (roots: TrustRoot[]) => void;
  hubs: Hub[];
}

// Who the selected account has blocked or ignored — about other people,
// unlike Devices (what can access the account), hence its own tab.
export function PrivacyTab(props: Props) {
  const { t } = useTranslation();

  return (
    <section>
      <h1>{t("settings.tabs.privacy")}</h1>
      {props.managing && (
        <AccountBlockIgnoreSection
          account={props.managing}
          activeBlocks={props.blocks}
          activeIgnores={props.ignores}
          onUnblockActive={props.onUnblock}
          onUnignoreActive={props.onUnignore}
          knownNames={props.knownNames}
        />
      )}
      <TrustedIssuersSection
        roots={props.trustRoots}
        onChange={props.onTrustRootsChange}
        joinedHubs={knownIssuerHubs(props.hubs, [])}
        lookupHub={lookupIssuerHub}
      />
    </section>
  );
}
