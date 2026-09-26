import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";

interface Props {
  /** Save the typed name as this identity's display name on the current hub. */
  onSave: (name: string) => void | Promise<void>;
  onSkip: () => void;
}

// Asked once, on the first hub an identity joins with no display name: without
// it a member shows in the roster as a slice of their pubkey, which is what a
// fresh desktop identity did until 2026-09-06 — the prompt was web-only, and
// desktop's onboarding has no nickname step either.
//
// It holds its own draft: the name matters only until it is saved, and a
// caller that has to thread the input state through is a caller that has to
// duplicate this component to reuse it.
export function DisplayNamePrompt({ onSave, onSkip }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <div className="modal-overlay" onClick={onSkip}>
      <FocusTrap>
        <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
          <h3>{t("onboarding.display_name.title")}</h3>
          <p className="muted" style={{ marginBottom: 12, fontSize: "var(--text-sm)" }}>
            {t("onboarding.display_name.hint")}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed) void onSave(trimmed);
              if (e.key === "Escape") onSkip();
            }}
            placeholder={t("onboarding.display_name.placeholder")}
            aria-label={t("onboarding.display_name.title")}
            style={{ width: "100%", marginBottom: 12 }}
            autoFocus
          />
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onSkip}>
              {t("onboarding.display_name.skip")}
            </button>
            <button onClick={() => void onSave(trimmed)} disabled={!trimmed}>
              {t("onboarding.display_name.save")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
