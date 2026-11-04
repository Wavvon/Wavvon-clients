import { useTranslation } from "react-i18next";
import { BlockIgnoreSection, TrustedIssuersSection, knownIssuerHubs, type TrustRoot } from "@wavvon/ui";
import { lookupIssuerHub } from "../../hooks/hubAdminActions";
import type { BlockEntry, Hub, IgnoreEntry } from "../../types";

interface Props {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  trustRoots: TrustRoot[];
  onTrustRootsChange: (roots: TrustRoot[]) => void;
  hubs: Hub[];
}

// Who the active account has blocked or ignored.
export function PrivacyTab({ blocks, ignores, onUnblock, onUnignore, knownNames, trustRoots, onTrustRootsChange, hubs }: Props) {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("settings.tabs.privacy")}</h1>
      <BlockIgnoreSection
        blocks={blocks}
        ignores={ignores}
        onUnblock={onUnblock}
        onUnignore={onUnignore}
        knownNames={knownNames}
      />
      <TrustedIssuersSection
        roots={trustRoots}
        onChange={onTrustRootsChange}
        joinedHubs={knownIssuerHubs(hubs, [])}
        lookupHub={lookupIssuerHub}
      />
    </section>
  );
}
