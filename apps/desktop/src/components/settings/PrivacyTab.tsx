import { useTranslation } from "react-i18next";
import { BlockedUsersSection } from "@wavvon/ui";
import type { BlockEntry } from "../../types";

interface Props {
  blocks: BlockEntry[];
  onUnblock: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
}

// Who the active account has blocked.
export function PrivacyTab({ blocks, onUnblock, knownNames }: Props) {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("settings.tabs.privacy")}</h1>
      <BlockedUsersSection
        blocks={blocks}
        onUnblock={onUnblock}
        knownNames={knownNames}
      />
    </section>
  );
}
