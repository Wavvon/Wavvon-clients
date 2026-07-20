import { useTranslation } from "react-i18next";
import type { Hub, PerAccountProps, ProfileAccountRef, ProfileEditorActions, MyCertification } from "../../types";
import { ProfileEditorSection } from "./ProfileEditorSection";
import { MyCertificationsSection } from "./MyCertificationsSection";

interface Props extends PerAccountProps<ProfileAccountRef> {
  hubs: Hub[];
  publicKey: string | null;
  onHubProfileSaved?: (hubId: string) => void;
  actions: ProfileEditorActions;
}

// Who the selected account is: one profile editor over every context (the
// default profile plus each joined hub — hub contexts need the active
// account's live sessions), and its earned badges (active account only).
export function ProfileTab(props: Props) {
  const { t } = useTranslation();
  const managingIsActive = props.managing?.id === props.activeId;

  return (
    <section style={{ maxWidth: 1080 }}>
      <h1 style={{ marginBottom: 4 }}>{t("settings.tabs.profile")}</h1>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 20 }}>
        {t("settings.profile.subtitle")}
      </p>
      {/* Editor card and the badges/certifications panel side by side on wide
          screens; the panel stacks under the card on narrow ones. The account
          picker lives inline in the editor's scope line, not as a separate
          "Managing" box — you're choosing whose profile to edit, right there. */}
      <div className="profile-two-col">
        {props.managing && (
          <ProfileEditorSection
            hubs={props.hubs}
            account={props.managing}
            isActive={managingIsActive}
            publicKey={props.publicKey}
            accounts={props.accounts}
            activeId={props.activeId}
            onManagingChange={props.onManagingChange}
            onHubProfileSaved={props.onHubProfileSaved}
            actions={props.actions}
          />
        )}
        {managingIsActive && (
          <MyCertificationsSection
            publicKey={props.publicKey}
            listMyCertifications={props.actions.listMyCertifications as (pubkey: string) => Promise<MyCertification[]>}
          />
        )}
      </div>
    </section>
  );
}
