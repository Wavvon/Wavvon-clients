import type { ChallengeDifficulty, ChallengeMode } from "../../types";

interface Props {
  mode: ChallengeMode;
  difficulty: ChallengeDifficulty;
  onClose: () => void;
}

// APPROXIMATION: the real member-facing challenge (the "not a bot" click
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
  const showsClickFirst = mode === "click" || mode === "both";
  const showsPuzzle = mode === "puzzle" || mode === "both";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal challenge-modal" onClick={(e) => e.stopPropagation()}>
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
          Preview — approximation of what a joining member sees (mode: {mode}, difficulty: {difficulty})
        </p>

        {mode === "off" && (
          <p className="muted">No challenge is shown — anyone can join without proving they're human.</p>
        )}

        {mode !== "off" && showsClickFirst && (
          <div className="challenge-click-content">
            <p className="muted challenge-subtext">Quick check before you can send messages.</p>
            <button className="challenge-not-a-bot-btn" disabled>I'm not a bot</button>
          </div>
        )}

        {mode !== "off" && showsPuzzle && !showsClickFirst && (
          <>
            <h3>Quick check</h3>
            <PuzzleMock difficulty={difficulty} />
            <input type="text" placeholder="Your answer" disabled />
          </>
        )}

        {mode !== "off" && showsPuzzle && showsClickFirst && (
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            After confirming, a puzzle like this follows:
          </p>
        )}
        {mode !== "off" && showsPuzzle && showsClickFirst && <PuzzleMock difficulty={difficulty} />}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Close preview</button>
        </div>
      </div>
    </div>
  );
}
