import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { FocusTrap, JoinForm } from "@wavvon/ui";
import type { Survey, SurveyAnswer, SurveySubmitResult } from "../types";

export interface SurveyProps {
  hubUrl: string;
  onComplete: (result: SurveySubmitResult) => void;
  onSkip?: () => void;
  embedded?: boolean;
}

type SubmitState = "idle" | "submitting" | "approved" | "pending";

export function SurveyComponent({ hubUrl, onComplete, onSkip, embedded = false }: SurveyProps) {
  const { t } = useTranslation();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
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

  async function handleSubmit(answerList: SurveyAnswer[]) {
    if (!survey) return;
    setSubmitState("submitting");
    try {
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
        <div className="survey-result-ok">{t("survey.result.approved")}</div>
      )}
      {submitState === "pending" && pendingResult && (
        <div className="survey-pending-notice">
          <p>{t("survey.result.pending")}</p>
          <div className="survey-actions">
            <button onClick={() => onComplete(pendingResult)}>{t("modal.close")}</button>
          </div>
        </div>
      )}
      {submitState !== "approved" && submitState !== "pending" && (
        <JoinForm
          form={survey}
          submitting={submitState === "submitting"}
          onSubmit={(a) => void handleSubmit(a)}
          onCancel={onSkip}
          cancelLabel={t("onboarding.display_name.skip")}
        />
      )}
    </>
  );

  if (embedded) {
    return <div className="survey-embedded">{formContent}</div>;
  }

  return (
    <div className="modal-overlay">
      <FocusTrap>
        <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="survey-title">
          <h3 id="survey-title">{t("survey.modal.title")}</h3>
          {formContent}
        </div>
      </FocusTrap>
    </div>
  );
}
