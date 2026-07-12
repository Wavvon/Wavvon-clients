import { useTranslation } from "react-i18next";
import type { BlockEntry, IgnoreEntry } from "@shared/types";
import { AccountBlockIgnoreSection } from "../AccountBlockIgnoreSection";
import { ManagingAccountSelector } from "../ManagingAccountSelector";
import type { PerAccountProps } from "./perAccount";

interface Props extends PerAccountProps {
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
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
    </section>
  );
}
