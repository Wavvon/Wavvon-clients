import { useTranslation } from "react-i18next";
import { BlockIgnoreSection, TrustedIssuersSection, type TrustRoot } from "@wavvon/ui";
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
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.privacy")}</h1>
      <BlockIgnoreSection
        blocks={blocks}
        ignores={ignores}
        onUnblock={onUnblock}
        onUnignore={onUnignore}
        knownNames={knownNames}
      />
      <TrustedIssuersSection roots={trustRoots} onChange={onTrustRootsChange} />
      <div className="settings-section">
        <label className="settings-label">{t("settings.privacy.birthdays.label")}</label>
        <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={hideBirthdays} onChange={onToggleHideBirthdays} />
          {t("settings.privacy.birthdays.hide")}
        </label>
      </div>
    </section>
  );
}
