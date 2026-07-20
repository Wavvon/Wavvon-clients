import { useState } from "react";
import { FocusTrap } from "@wavvon/ui";
import type { SurveyAdmin, SurveyAnswerInput } from "@platform";
import { submitSurvey } from "@platform";
import { HubApiError } from "../../platform/http";

// Member-facing onboarding survey. Shown when a hub has an active survey.
export function SurveyModal({ survey, onDone, onSkip }: {
  survey: SurveyAdmin;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({}); // question_id → choice_id | text
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRequired = survey.questions.some((q) => q.required && !answers[q.id]?.trim());

  async function submit() {
    setBusy(true); setError(null);
    try {
      const payload: SurveyAnswerInput[] = survey.questions.map((q) => {
        const v = answers[q.id];
        return q.kind === "choice"
          ? { question_id: q.id, choice_id: v || undefined }
          : { question_id: q.id, text_answer: v || undefined };
      });
      await submitSurvey(survey.id, payload);
      onDone();
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <FocusTrap>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="survey-title" style={{ maxWidth: 480 }}>
          <h3 id="survey-title">A few questions before you join</h3>
          {error && <div className="error" style={{ marginBottom: "var(--space-2)" }}>{error}</div>}

          {survey.questions.map((q) => (
            <div key={q.id} className="settings-section">
              <label className="settings-label">
                {q.prompt}{q.required && <span style={{ color: "var(--danger)" }}> *</span>}
              </label>
              {q.kind === "text" ? (
                <input
                  type="text"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  aria-label={q.prompt}
                  style={{ width: "100%" }}
                />
              ) : (
                (q.choices ?? []).map((c) => (
                  <label key={c.id} className="checkbox-label" style={{ display: "block" }}>
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === c.id}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                    />
                    {c.label}
                  </label>
                ))
              )}
            </div>
          ))}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onSkip} disabled={busy}>Skip for now</button>
            <button onClick={submit} disabled={busy || missingRequired}>Submit</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
