import { useTranslation } from "react-i18next";
import type { Hub } from "@shared/types";
import { ProfileEditorSection } from "../ProfileEditorSection";
import { MyCertificationsSection } from "../MyCertificationsSection";
import { ManagingAccountSelector } from "../ManagingAccountSelector";
import type { PerAccountProps } from "./perAccount";

interface Props extends PerAccountProps {
  hubs: Hub[];
  publicKey: string | null;
  onHubProfileSaved?: (hubId: string) => void;
}

// Who the selected account is: one profile editor over every context (the
// default profile plus each joined hub — hub contexts need the active
// account's live sessions), and its earned badges (active account only).
export function ProfileTab(props: Props) {
  const { t } = useTranslation();
  const managingIsActive = props.managing?.id === props.activeId;

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.profile")}</h1>
      {props.accounts && props.managing && (
        <ManagingAccountSelector
          accounts={props.accounts}
          activeId={props.activeId}
          selectedId={props.managing.id}
          onChange={props.onManagingChange}
        />
      )}
      {props.managing && (
        <ProfileEditorSection
          hubs={props.hubs}
          account={props.managing}
          isActive={managingIsActive}
          publicKey={props.publicKey}
          onHubProfileSaved={props.onHubProfileSaved}
        />
      )}
      {managingIsActive && <MyCertificationsSection publicKey={props.publicKey} />}
    </section>
  );
}
