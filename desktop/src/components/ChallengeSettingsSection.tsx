import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type ChallengeMode = "off" | "click" | "puzzle" | "both";
type ChallengeDifficulty = "easy" | "medium";

export function ChallengeSettingsSection({ hubUrl }: { hubUrl: string }) {
  const [mode, setMode] = useState<ChallengeMode>("off");
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>("easy");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const showDifficulty = mode === "puzzle" || mode === "both";

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await invoke("set_challenge_settings", {
        hubUrl,
        challengeMode: mode,
        challengeDifficulty: difficulty,
      });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h1>Challenge</h1>
      <p className="muted">
        Require new members to solve a lightweight human check before joining.
        Independent of proof-of-work level.
      </p>

      <div className="settings-section">
        <label className="settings-label">Challenge mode</label>
        {(
          [
            ["off", "Off"],
            ["click", "Click only — one button press"],
            ["puzzle", "Puzzle only — server-generated SVG challenge"],
            ["both", "Click then puzzle — maximum friction"],
          ] as [ChallengeMode, string][]
        ).map(([value, label]) => (
          <label key={value} className="checkbox-label" style={{ display: "block", marginBottom: "var(--space-2)" }}>
            <input
              type="radio"
              name="challenge-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {showDifficulty && (
        <div className="settings-section">
          <label className="settings-label">Puzzle difficulty</label>
          {(
            [
              ["easy", "Easy"],
              ["medium", "Medium"],
            ] as [ChallengeDifficulty, string][]
          ).map(([value, label]) => (
            <label key={value} className="checkbox-label" style={{ display: "block", marginBottom: "var(--space-2)" }}>
              <input
                type="radio"
                name="challenge-difficulty"
                value={value}
                checked={difficulty === value}
                onChange={() => setDifficulty(value)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      <div className="settings-section">
        {saveMsg && <p className="muted">{saveMsg}</p>}
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
