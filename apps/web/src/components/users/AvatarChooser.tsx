import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarPicker, ImagePicker } from "@wavvon/ui";

interface Props {
  value: string | null;
  fallbackName: string;
  onChange: (avatar: string) => void;
  onClear: () => void;
}

type Mode = "upload" | "generated";

// Combines the existing image-upload picker with the generated-avatar grid
// behind a small tab switch, so both create and edit flows offer the same
// two ways to set an avatar.
export function AvatarChooser({ value, fallbackName, onChange, onClear }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("upload");

  return (
    <div className="avatar-chooser">
      <div className="avatar-editor">
        <Avatar src={value} name={fallbackName} size={56} />
        <div className="avatar-chooser-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={`avatar-chooser-tab ${mode === "upload" ? "active" : ""}`}
            onClick={() => setMode("upload")}
          >
            {t("profile.avatar_chooser.upload_tab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "generated"}
            className={`avatar-chooser-tab ${mode === "generated" ? "active" : ""}`}
            onClick={() => setMode("generated")}
          >
            {t("profile.avatar_chooser.generated_tab")}
          </button>
        </div>
      </div>

      {mode === "upload" ? (
        <ImagePicker
          onPick={onChange}
          onClear={onClear}
          hasValue={!!value}
          buttonLabel={t("profile.avatar_chooser.upload_button")}
        />
      ) : (
        <AvatarPicker onPick={onChange} />
      )}
    </div>
  );
}
