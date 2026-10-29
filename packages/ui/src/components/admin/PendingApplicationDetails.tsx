import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SurveyResponseAdmin } from "../../types";

interface Props {
  pubkey: string;
  loadApplication: (pubkey: string) => Promise<SurveyResponseAdmin | null>;
  /** Absent where the platform cannot reject; then only the answers show. */
  onReject?: (pubkey: string, reason: string) => Promise<void>;
}

/** One joiner's application in the approval queue (join-forms.md): the
 *  answers, and a rejection with a reason the joiner will read. */
export function PendingApplicationDetails({ pubkey, loadApplication, onReject }: Props) {
  const { t } = useTranslation();
  const [response, setResponse] = useState<SurveyResponseAdmin | null | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadApplication(pubkey)
      .then((r) => { if (!cancelled) setResponse(r); })
      .catch((e) => { if (!cancelled) { setError(String(e instanceof Error ? e.message : e)); setResponse(null); } });
    return () => { cancelled = true; };
  }, [pubkey, loadApplication]);

  async function reject() {
    if (!onReject) return;
    setBusy(true);
    setError(null);
    try {
      await onReject(pubkey, reason.trim());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  if (response === undefined) return <p className="muted">{t("hub.admin.survey.loading")}</p>;

  return (
    <div>
      {response && (
        <dl className="survey-answer-list">
          {response.answers.map((a) => (
            <div key={a.question_id} className="survey-answer-item">
              <dt className="muted">{a.prompt}</dt>
              <dd>
                {a.checked !== undefined
                  ? (a.checked ? "✓" : "✗")
                  : a.choice_label ?? a.text_answer ?? <span className="muted">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {onReject && (
        <div className="settings-row" style={{ gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("hub.admin.members.pending.reject_reason")}
            aria-label={t("hub.admin.members.pending.reject_reason")}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button className="btn-small danger" disabled={busy} onClick={() => void reject()}>
            {t("hub.admin.members.pending.reject")}
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
