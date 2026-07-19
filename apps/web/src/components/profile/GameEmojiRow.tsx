import { useTranslation } from "react-i18next";
import { GAME_ACTIVITY_EMOJI } from "@shared/constants";

// Small curated row above the Activities textarea in edit mode. Clicking an
// emoji inserts it at the start of the current line — the insertion itself
// is handled by the caller (needs the textarea's cursor position).
export function GameEmojiRow({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
      {GAME_ACTIVITY_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="reaction-picker-emoji"
          onClick={() => onPick(emoji)}
          title={t("settings.profile.fields.game_icon_insert", { emoji })}
          aria-label={t("settings.profile.fields.game_icon_insert", { emoji })}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
