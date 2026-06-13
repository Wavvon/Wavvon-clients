import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Survey, SurveyAnswer, SurveySubmitResult } from "../types";

export interface SurveyProps {
  hubUrl: string;
  onComplete: (result: SurveySubmitResult) => void;
  onSkip?: () => void;
  embedded?: boolean;
}

type SubmitState = "idle" | "submitting" | "approved" | "pending";

export function SurveyComponent({ hubUrl, onComplete, onSkip, embedded = false }: SurveyProps) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [pendingResult, setPendingResult] = useState<SurveySubmitResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<Survey | null>("survey_current", { hubUrl })
      .then((s) => {
        if (cancelled) return;
        setSurvey(s);
        setLoading(false);
        if (!s) {
          onComplete({ next_state: "approved", applied_roles: [] });
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [hubUrl]);

  function setChoiceAnswer(questionId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { question_id: questionId, choice_id: choiceId } }));
  }

  function setTextAnswer(questionId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { question_id: questionId, text_answer: text } }));
  }

  const allRequiredAnswered = survey
    ? survey.questions.every((q) => !q.required || !!answers[q.id])
    : false;

  async function handleSubmit() {
    if (!survey) return;
    setSubmitState("submitting");
    try {
      const answerList = Object.values(answers);
      const result = await invoke<SurveySubmitResult>("survey_submit", {
        hubUrl,
        surveyId: survey.id,
        answers: answerList,
      });
      if (result.next_state === "approved") {
        setSubmitState("approved");
        setTimeout(() => onComplete(result), 1000);
      } else {
        setSubmitState("pending");
        setPendingResult(result);
      }
    } catch {
      setSubmitState("idle");
    }
  }

  if (loading) {
    return null;
  }

  if (!survey) {
    return null;
  }

  const formContent = (
    <>
      {submitState === "approved" && (
        <div className="survey-result-ok">All set!</div>
      )}
      {submitState === "pending" && pendingResult && (
        <div className="survey-pending-notice">
          <p>Your answers have been sent for review. You'll be notified when approved.</p>
          <button onClick={() => onComplete(pendingResult)}>Close</button>
        </div>
      )}
      {submitState !== "approved" && submitState !== "pending" && (
        <div className="survey-form">
          {survey.questions
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((q) => (
              <div key={q.id} className="survey-question">
                <label className="survey-question-label">
                  {q.prompt}
                  {q.required && <span className="survey-required"> *</span>}
                </label>
                {q.kind === "choice" && q.choices && (
                  <div className="survey-choices">
                    {q.choices
                      .slice()
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((c) => (
                        <label key={c.id} className="survey-choice-label">
                          <input
                            type="radio"
                            name={q.id}
                            value={c.id}
                            checked={answers[q.id]?.choice_id === c.id}
                            onChange={() => setChoiceAnswer(q.id, c.id)}
                          />
                          {c.label}
                        </label>
                      ))}
                  </div>
                )}
                {q.kind === "text" && (
                  <div className="survey-text-wrap">
                    <textarea
                      maxLength={500}
                      rows={3}
                      value={answers[q.id]?.text_answer ?? ""}
                      onChange={(e) => setTextAnswer(q.id, e.target.value)}
                    />
                    <span className="survey-char-count muted">
                      {(answers[q.id]?.text_answer ?? "").length} / 500
                    </span>
                  </div>
                )}
              </div>
            ))}
          <div className="survey-actions">
            {onSkip && (
              <button className="btn-secondary" onClick={onSkip}>
                Skip
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!allRequiredAnswered || submitState === "submitting"}
            >
              {submitState === "submitting" ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="survey-embedded">{formContent}</div>;
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h3>A quick question before you join</h3>
        {formContent}
      </div>
    </div>
  );
}
