import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AvatarChooser } from "@wavvon/ui";

interface Props {
  onSave: (displayName: string, avatar: string | null) => void;
  onSkip: () => void;
}

// Final onboarding step, shown after an identity is created, recovered or
// paired: pick the nickname + avatar that become the user's default profile
// (a client-only preset, see utils/profiles.ts). The default profile is
// applied automatically the first time the user joins a hub.
export function ProfileSetupStep({ onSave, onSkip }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 32 }}>
      <h2>{t("onboarding.profile.title")}</h2>
      <p className="muted">{t("onboarding.profile.hint")}</p>
      <label className="settings-label">{t("onboarding.profile.name_label")}</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim(), avatar); }}
        placeholder={t("onboarding.profile.name_placeholder")}
        aria-label={t("onboarding.profile.name_label")}
        style={{ width: "100%", marginBottom: 12 }}
        autoFocus
      />
      <AvatarChooser value={avatar} fallbackName={name} onChange={setAvatar} onClear={() => setAvatar(null)} />
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn-primary" onClick={() => onSave(name.trim(), avatar)} disabled={!name.trim()}>
          {t("onboarding.profile.continue")}
        </button>
        <button className="btn-ghost" onClick={onSkip}>
          {t("onboarding.profile.skip")}
        </button>
      </div>
    </div>
  );
}
