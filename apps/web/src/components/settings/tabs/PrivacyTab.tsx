import { useTranslation } from "react-i18next";
import type { BlockEntry, IgnoreEntry } from "@shared/types";
import { AccountBlockIgnoreSection } from "../AccountBlockIgnoreSection";
import { ManagingAccountSelector } from "../ManagingAccountSelector";
import type { PerAccountProps, TrustRoot } from "@wavvon/ui";
import { TrustedIssuersSection } from "@wavvon/ui";
import type { IdentityRecord } from "@identity/index";

interface Props extends PerAccountProps<IdentityRecord> {
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

// Who the selected account has blocked or ignored — about other people,
// unlike Devices (what can access the account), hence its own tab.
export function PrivacyTab(props: Props) {
  const { t } = useTranslation();

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.privacy")}</h1>
      {props.accounts && props.managing && (
        <ManagingAccountSelector
          accounts={props.accounts}
          activeId={props.activeId}
          selectedId={props.managing.id}
          onChange={props.onManagingChange}
        />
      )}
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
      <TrustedIssuersSection roots={props.trustRoots} onChange={props.onTrustRootsChange} />
      <div className="settings-section">
        <label className="settings-label">{t("settings.privacy.birthdays.label")}</label>
        <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={props.hideBirthdays}
            onChange={props.onToggleHideBirthdays}
          />
          {t("settings.privacy.birthdays.hide")}
        </label>
      </div>
    </section>
  );
}
