import { useTranslation } from "react-i18next";
import { BlockIgnoreSection, SettingRow, TrustedIssuersSection, type TrustRoot } from "@wavvon/ui";
import type { BlockEntry, IgnoreEntry } from "../../types";

interface Props {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  hideBirthdays: boolean;
  onToggleHideBirthdays: () => void;
  trustRoots: TrustRoot[];
  onTrustRootsChange: (roots: TrustRoot[]) => void;
}

// Who the active account has blocked or ignored.
export function PrivacyTab({ blocks, ignores, onUnblock, onUnignore, knownNames, hideBirthdays, onToggleHideBirthdays, trustRoots, onTrustRootsChange }: Props) {
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
      <TrustedIssuersSection roots={trustRoots} onChange={onTrustRootsChange} />
      <SettingRow
        title={t("settings.privacy.birthdays.label")}
        state={hideBirthdays
          ? t("settings.privacy.birthdays.state.hidden")
          : t("settings.privacy.birthdays.state.shown")}
        control={
          <input
            type="checkbox"
            checked={hideBirthdays}
            aria-label={t("settings.privacy.birthdays.hide")}
            onChange={onToggleHideBirthdays}
          />
        }
      />
    </section>
  );
}
