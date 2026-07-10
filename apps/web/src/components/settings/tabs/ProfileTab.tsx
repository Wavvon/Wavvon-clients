import { useTranslation } from "react-i18next";
import type { Hub, NamedProfile } from "@shared/types";
import { ProfilesSection } from "../ProfilesSection";
import { ActiveHubProfileSection } from "../ActiveHubProfileSection";

interface Props {
  hubs: Hub[];
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  activeDisplayName: string | null;
  onCreateProfile: (label: string, displayName: string, avatar: string | null) => void;
  onUpdateProfile: (id: string, patch: Partial<Omit<NamedProfile, "id">>) => void;
  onDeleteProfile: (id: string) => void;
  onSetDefaultProfile: (id: string) => void;
  onApplyProfileToHub: (id: string) => void;
}

export function ProfileTab(props: Props) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language ?? "en").slice(0, 2);
  function changeLanguage(lng: string) {
    void i18n.changeLanguage(lng);
    try { localStorage.setItem("wavvon_language", lng); } catch { /* ignore */ }
  }

  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.profile")}</h1>

      <ActiveHubProfileSection
        hubs={props.hubs}
        profiles={props.profiles}
        defaultProfileId={props.defaultProfileId}
        activeDisplayName={props.activeDisplayName}
        onApply={props.onApplyProfileToHub}
      />

      <div className="settings-section" style={{ marginTop: 20 }}>
        <label className="settings-label" htmlFor="settings-language">{t("settings.language.label")}</label>
        <select
          id="settings-language"
          value={currentLang}
          onChange={(e) => changeLanguage(e.target.value)}
          style={{ width: "100%", maxWidth: 320 }}
        >
          <option value="en">English</option>
          <option value="it">Italiano</option>
          <option value="es">Español</option>
          <option value="de">Deutsch</option>
        </select>
      </div>

      <ProfilesSection
        profiles={props.profiles}
        defaultProfileId={props.defaultProfileId}
        hubs={props.hubs}
        onCreate={props.onCreateProfile}
        onUpdate={props.onUpdateProfile}
        onDelete={props.onDeleteProfile}
        onSetDefault={props.onSetDefaultProfile}
        onApplyToHub={props.onApplyProfileToHub}
      />
    </section>
  );
}
