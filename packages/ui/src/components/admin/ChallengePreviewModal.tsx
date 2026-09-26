import type { ChallengeDifficulty, ChallengeMode } from "../../types";
import { useTranslation } from "react-i18next";

interface Props {
  mode: ChallengeMode;
  difficulty: ChallengeDifficulty;
  onClose: () => void;
}

// APPROXIMATION: the real member-facing challenge (the "I am human" click
// button, and the puzzle image + answer field) is rendered at join time by
// each client's own onboarding flow — this preview reproduces that UI's shape
// and CSS classes faithfully, but the puzzle graphic below is a static
// placeholder, not a real generated challenge.
function PuzzleMock({ difficulty }: { difficulty: ChallengeDifficulty }) {
  const label = difficulty === "medium" ? "7 × 6" : "3 + 4";
  return (
    <div className="challenge-svg-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" width="220" height="90" viewBox="0 0 220 90">
        <rect width="220" height="90" fill="var(--bg-sunken)" />
        <text x="110" y="52" textAnchor="middle" fontSize="28" fontFamily="monospace" fill="var(--text)">
          {label} = ?
        </text>
      </svg>
    </div>
  );
}

export function ChallengePreviewModal({ mode, difficulty, onClose }: Props) {
  const { t } = useTranslation();
  const showsClickFirst = mode === "click" || mode === "both";
  const showsPuzzle = mode === "puzzle" || mode === "both";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal challenge-modal" onClick={(e) => e.stopPropagation()}>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
          Preview — approximation of what a joining member sees (mode: {mode}, difficulty: {difficulty})
        </p>

        {mode === "off" && (
          <p className="muted">{t("hub.admin.challenge_preview.off")}</p>
        )}

        {mode !== "off" && showsClickFirst && (
          <div className="challenge-click-content">
            <p className="muted challenge-subtext">{t("hub.admin.challenge_preview.click_subtext")}</p>
            <button className="challenge-confirm-btn" disabled>{t("hub.admin.challenge_preview.confirm")}</button>
          </div>
        )}

        {mode !== "off" && showsPuzzle && !showsClickFirst && (
          <>
            <h3>{t("hub.admin.challenge_preview.puzzle_title")}</h3>
            <PuzzleMock difficulty={difficulty} />
            <input type="text" placeholder={t("hub.admin.challenge_preview.answer_placeholder")} disabled />
          </>
        )}

        {mode !== "off" && showsPuzzle && showsClickFirst && (
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("hub.admin.challenge_preview.then_puzzle")}
          </p>
        )}
        {mode !== "off" && showsPuzzle && showsClickFirst && <PuzzleMock difficulty={difficulty} />}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>{t("hub.admin.challenge_preview.close")}</button>
        </div>
      </div>
    </div>
  );
}
