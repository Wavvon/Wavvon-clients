import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hub, NamedProfile } from "@shared/types";
import { loadHubProfiles, saveHubProfiles } from "@shared/utils/profiles";

interface Props {
  hubs: Hub[];
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  activeDisplayName: string | null;
  onApply: (id: string) => void;
}

// Per-hub identity selector: which Saved Profile (see ProfilesSection below)
// is currently applied to the active hub. This replaced the old raw
// display_name/avatar inputs — profiles are now the only place those are
// edited; this control only assigns one to the active hub.
export function ActiveHubProfileSection({ hubs, profiles, defaultProfileId, activeDisplayName, onApply }: Props) {
  const { t } = useTranslation();
  const activeHub = hubs.find((h) => h.is_active);
  const [hubProfiles, setHubProfiles] = useState<Record<string, string>>(loadHubProfiles);

  if (profiles.length === 0) {
    return (
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <label className="settings-label">{t("settings.profile.active_hub.label")}</label>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.profile.active_hub.no_profiles")}
        </p>
      </div>
    );
  }

  const selected = (activeHub && hubProfiles[activeHub.hub_id]) || defaultProfileId || profiles[0].id;

  function handleChange(id: string) {
    if (!activeHub || !id) return;
    const next = { ...hubProfiles, [activeHub.hub_id]: id };
    setHubProfiles(next);
    saveHubProfiles(next);
    onApply(id);
  }

  return (
    <div className="settings-section" style={{ marginBottom: 20 }}>
      <label className="settings-label" htmlFor="settings-active-profile">{t("settings.profile.active_hub.label")}</label>
      <div className="profile-select-row">
        <select
          id="settings-active-profile"
          value={selected}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!activeHub}
          style={{ maxWidth: 320 }}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {defaultProfileId === p.id ? ` (${t("profile.default_badge")})` : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 6 }}>
        {activeHub
          ? t("settings.profile.active_hub.current", { name: activeDisplayName || t("profile.no_display_name") })
          : t("profile.apply_hint")}
      </p>
    </div>
  );
}
