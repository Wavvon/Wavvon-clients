import { useTranslation } from "react-i18next";
import { BlockIgnoreSection } from "@wavvon/ui";
import type { BlockEntry, IgnoreEntry } from "../../types";

interface Props {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
}

// Who the active account has blocked or ignored.
export function PrivacyTab({ blocks, ignores, onUnblock, onUnignore, knownNames }: Props) {
  const { t } = useTranslation();
  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.privacy")}</h1>
      <BlockIgnoreSection
        blocks={blocks}
        ignores={ignores}
        onUnblock={onUnblock}
        onUnignore={onUnignore}
        knownNames={knownNames}
      />
    </section>
  );
}
