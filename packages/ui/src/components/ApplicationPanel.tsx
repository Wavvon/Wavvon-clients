import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { JoinForm } from "./JoinForm";
import type { ApplicationStatus, Survey, SurveyAnswer } from "../types";

export interface ApplicationActions {
  getForm: () => Promise<Survey | null>;
  getStatus: () => Promise<ApplicationStatus>;
  submit: (formId: string, answers: SurveyAnswer[]) => Promise<void>;
}

interface Props {
  actions: ApplicationActions;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The join application, for a joiner the hub holds `pending`
 *  (join-forms.md): the form until they send it, then where it stands. A
 *  rejection shows the moderator's reason and when they may apply again.
 *  Renders nothing on a hub that takes no applications, leaving the caller's
 *  plain "waiting for approval" text alone. */
export function ApplicationPanel({ actions }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Survey | null>(null);
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([actions.getForm(), actions.getStatus()]);
      setForm(f);
      setStatus(s);
    } catch (e) {
      setError(errorText(e));
    }
  }, [actions]);

  useEffect(() => { void load(); }, [load]);

  if (!form || !status) return error ? <p className="error-text">{error}</p> : null;

  const now = Math.floor(Date.now() / 1000);
  const mayApply =
    status.state === "none" ||
    (status.state === "rejected" && (status.retry_after ?? 0) <= now);

  async function submit(answers: SurveyAnswer[]) {
    if (!form) return;
    setSubmitting(true);
    setError(null);
    try {
      await actions.submit(form.id, answers);
      await load();
    } catch (e) {
      const msg = errorText(e);
      const refused = /consent_refused:(\S+)/.exec(msg)?.[1];
      const prompt = form.questions.find((q) => q.id === refused)?.prompt;
      setError(prompt ? t("join_form.consent_required", { prompt }) : msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="survey-embedded" style={{ textAlign: "left", width: "100%", maxWidth: 520 }}>
      {status.state === "rejected" && (
        <div className="survey-pending-notice">
          <p>{status.reason
            ? t("application.rejected_reason", { reason: status.reason })
            : t("application.rejected")}</p>
          {!mayApply && status.retry_after && (
            <p className="muted">
              {t("application.retry_on", { date: new Date(status.retry_after * 1000).toLocaleDateString() })}
            </p>
          )}
        </div>
      )}
      {status.state === "submitted" && <p className="muted">{t("application.submitted")}</p>}
      {mayApply && (
        <>
          <h3>{t("application.title")}</h3>
          <JoinForm form={form} submitting={submitting} error={error} onSubmit={(a) => void submit(a)} />
        </>
      )}
    </div>
  );
}
