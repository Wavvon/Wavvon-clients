import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import type { Survey } from "../types";

interface Props {
  hubName: string;
  form: Survey;
  onJoin: () => void;
  onCancel: () => void;
}

/** A hub's join application, read before joining (join-forms.md): the
 *  questions and the statements it asks the joiner to agree to, so someone
 *  for whom this is not the place can turn back without leaving anything on
 *  the hub. The answers are given after joining, on the pending screen. */
export function ApplicationPreview({ hubName, form, onJoin, onCancel }: Props) {
  const { t } = useTranslation();
  useCloseOnEscape(onCancel);
  const questions = form.questions.slice().sort((a, b) => a.display_order - b.display_order);
  return (
    <div className="modal-overlay">
      <FocusTrap>
        <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="application-preview-title">
          <h3 id="application-preview-title">{t("application.preview_title", { hub: hubName })}</h3>
          <p className="muted">{t("application.preview_body")}</p>
          <ul className="survey-form">
            {questions.map((q) => (
              <li key={q.id} className="survey-question">
                <span className="survey-question-label">
                  {q.prompt}
                  {q.required && <span className="survey-required"> *</span>}
                </span>
                {q.help && <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{q.help}</p>}
              </li>
            ))}
          </ul>
          <div className="survey-actions">
            <button className="btn-secondary" onClick={onCancel}>{t("modal.cancel")}</button>
            <button onClick={onJoin}>{t("application.preview_join")}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
