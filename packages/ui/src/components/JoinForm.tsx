import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Survey, SurveyAnswer, SurveyQuestion } from "../types";

interface Props {
  form: Survey;
  submitting: boolean;
  /** Shown above the actions, e.g. the hub's refusal. */
  error?: string | null;
  onSubmit: (answers: SurveyAnswer[]) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

const DEFAULT_MAX_LEN = 500;

function byOrder<T extends { display_order: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.display_order - b.display_order);
}

export function isAnswered(q: SurveyQuestion, a: SurveyAnswer | undefined): boolean {
  if (!a) return false;
  switch (q.kind) {
    case "text": return !!a.text_answer?.trim();
    case "choice": return !!a.choice_id;
    case "multi": return (a.choice_ids?.length ?? 0) > 0;
    case "consent": return a.checked === true;
  }
}

/** Both join forms (join-forms.md): the application a joiner fills before
 *  membership and the onboarding survey after it. Prop-only: the caller owns
 *  fetching the form and sending the answers. A required consent left
 *  unchecked keeps the form from being sent and says why, with the hub's own
 *  help text, so a joiner learns this is not their place before applying. */
export function JoinForm({ form, submitting, error, onSubmit, onCancel, cancelLabel }: Props) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});

  const set = (questionId: string, patch: Omit<SurveyAnswer, "question_id">) =>
    setAnswers((prev) => ({ ...prev, [questionId]: { question_id: questionId, ...patch } }));

  const questions = byOrder(form.questions);
  const refusedConsent = questions.find(
    (q) => q.kind === "consent" && q.required && answers[q.id]?.checked === false,
  );
  const ready = questions.every((q) => !q.required || isAnswered(q, answers[q.id]));

  return (
    <div className="survey-form">
      {questions.map((q) => {
        const a = answers[q.id];
        return (
          <div key={q.id} className="survey-question">
            {q.kind === "consent" ? (
              <label className="survey-choice-label">
                <input
                  type="checkbox"
                  checked={a?.checked === true}
                  onChange={(e) => set(q.id, { checked: e.target.checked })}
                />
                {q.prompt}
                {q.required && <span className="survey-required"> *</span>}
              </label>
            ) : (
              <label className="survey-question-label" htmlFor={`jf-${q.id}`}>
                {q.prompt}
                {q.required && <span className="survey-required"> *</span>}
              </label>
            )}
            {q.help && <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{q.help}</p>}

            {q.kind === "choice" && (
              <div className="survey-choices">
                {byOrder(q.choices ?? []).map((c) => (
                  <label key={c.id} className="survey-choice-label">
                    <input
                      type="radio"
                      name={q.id}
                      checked={a?.choice_id === c.id}
                      onChange={() => set(q.id, { choice_id: c.id })}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}

            {q.kind === "multi" && (
              <div className="survey-choices">
                {byOrder(q.choices ?? []).map((c) => {
                  const picked = a?.choice_ids ?? [];
                  const on = picked.includes(c.id);
                  const full = !on && q.max_choices != null && picked.length >= q.max_choices;
                  return (
                    <label key={c.id} className="survey-choice-label">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={full}
                        onChange={() => set(q.id, {
                          choice_ids: on ? picked.filter((id) => id !== c.id) : [...picked, c.id],
                        })}
                      />
                      {c.label}
                    </label>
                  );
                })}
              </div>
            )}

            {q.kind === "text" && (() => {
              const max = q.max_len ?? DEFAULT_MAX_LEN;
              const value = a?.text_answer ?? "";
              return (
                <div className="survey-text-wrap">
                  {q.multiline === false ? (
                    <input
                      id={`jf-${q.id}`}
                      type="text"
                      maxLength={max}
                      value={value}
                      onChange={(e) => set(q.id, { text_answer: e.target.value })}
                    />
                  ) : (
                    <textarea
                      id={`jf-${q.id}`}
                      maxLength={max}
                      rows={3}
                      value={value}
                      onChange={(e) => set(q.id, { text_answer: e.target.value })}
                    />
                  )}
                  <span className="survey-char-count muted">{value.length} / {max}</span>
                </div>
              );
            })()}
          </div>
        );
      })}

      {refusedConsent && (
        <p className="error-text">{t("join_form.consent_required", { prompt: refusedConsent.prompt })}</p>
      )}
      {error && <p className="error-text">{error}</p>}

      <div className="survey-actions">
        {onCancel && (
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel ?? t("modal.cancel")}
          </button>
        )}
        <button
          onClick={() => onSubmit(Object.values(answers))}
          disabled={!ready || submitting}
        >
          {submitting ? t("survey.modal.submitting") : t("survey.modal.submit")}
        </button>
      </div>
    </div>
  );
}
