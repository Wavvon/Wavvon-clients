import { useState } from "react";
import { useTranslation } from "react-i18next";

export const URL_RE = /https?:\/\/[^\s<>"]+/;

/** Placeholder shown in place of a message from a user the viewer has
 * ignored (client-local mute, not a hub-side moderation action) — folded in
 * from desktop's copy, a real feature web's message list lacked. */
export function IgnoredMessagePlaceholder() {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  return (
    <li className="message message-row message-ignored-placeholder">
      {revealed ? null : (
        <button
          className="btn-link muted"
          style={{ fontSize: "var(--text-xs)" }}
          onClick={() => setRevealed(true)}
        >
          {t("message.ignored_placeholder")}
        </button>
      )}
    </li>
  );
}
