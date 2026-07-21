import { useTranslation } from "react-i18next";
import { BlockIgnoreSection } from "@wavvon/ui";
import type { BlockEntry, IgnoreEntry } from "../../types";

interface Props {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  hideBirthdays: boolean;
  onToggleHideBirthdays: () => void;
}

// Who the active account has blocked or ignored.
export function PrivacyTab({ blocks, ignores, onUnblock, onUnignore, knownNames, hideBirthdays, onToggleHideBirthdays }: Props) {
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
      <div className="settings-section">
        <label className="settings-label">Birthdays</label>
        <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={hideBirthdays} onChange={onToggleHideBirthdays} />
          Hide the 🎂 badge on members' birthdays
        </label>
      </div>
    </section>
  );
}
