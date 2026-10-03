import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import { SettingRow } from "../SettingRow";
import type { SurveyAdmin, SurveyQuestionAdmin, SurveyChoiceAdmin, SurveyResponseView } from "../../types";

function uid(): string {
  try { return crypto.randomUUID(); } catch { return `s-${Date.now()}-${Math.floor(Math.random() * 1e9)}`; }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface SurveyAdminSectionActions {
  getSurveyAdmin: () => Promise<SurveyAdmin | null>;
  setSurveyAdmin: (survey: SurveyAdmin) => Promise<void>;
  getSurveyResponses: () => Promise<SurveyResponseView[]>;
  loadAssignableRoles: () => Promise<{ id: string; name: string }[]>;
}

interface Props {
  actions: SurveyAdminSectionActions;
}

// Onboarding survey builder. New members answer it; choice answers can grant
// roles (role assignment on choices is a further follow-up — this builds the
// questions/choices and enables the survey).
export function SurveyAdminSection({ actions }: Props) {
  const { t } = useTranslation();
  const [survey, setSurvey] = useState<SurveyAdmin | null>(null);
  const [responses, setResponses] = useState<SurveyResponseView[] | null>(null);
  const [showResponses, setShowResponses] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignableRoles, setAssignableRoles] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  useEffect(() => {
    (async () => {
      try {
        const s = await actions.getSurveyAdmin();
        setSurvey(s ?? { id: uid(), enabled: false, questions: [] });
      } catch (e) {
        setError(errorMessage(e));
        setSurvey({ id: uid(), enabled: false, questions: [] });
      }
    })();
    actions.loadAssignableRoles()
      .then(setAssignableRoles)
      .catch(() => setAssignableRoles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadResponses() {
    try {
      setResponses(await actions.getSurveyResponses());
    } catch (e) {
      setError(errorMessage(e));
      setResponses([]);
    }
  }

  function toggleResponses() {
    const next = !showResponses;
    setShowResponses(next);
    setOpen(next ? "responses" : null);
    if (next && responses === null) void loadResponses();
  }

  function patch(next: Partial<SurveyAdmin>) {
    setSurvey((s) => (s ? { ...s, ...next } : s));
  }
  function patchQuestion(qid: string, p: Partial<SurveyQuestionAdmin>) {
    setSurvey((s) => s ? { ...s, questions: s.questions.map((q) => q.id === qid ? { ...q, ...p } : q) } : s);
  }
  function addQuestion(kind: "text" | "choice") {
    setSurvey((s) => s ? {
      ...s,
      questions: [...s.questions, {
        id: uid(), prompt: "", kind, required: false, display_order: s.questions.length,
        choices: kind === "choice" ? [] : undefined,
      }],
    } : s);
  }
  function removeQuestion(qid: string) {
    setSurvey((s) => s ? { ...s, questions: s.questions.filter((q) => q.id !== qid) } : s);
  }
  function addChoice(qid: string) {
    setSurvey((s) => s ? {
      ...s,
      questions: s.questions.map((q) => {
        if (q.id !== qid) return q;
        const choices: SurveyChoiceAdmin[] = [...(q.choices ?? []), { id: uid(), label: "", display_order: (q.choices?.length ?? 0), role_ids: [] }];
        return { ...q, choices };
      }),
    } : s);
  }
  function patchChoice(qid: string, cid: string, label: string) {
    setSurvey((s) => s ? {
      ...s,
      questions: s.questions.map((q) => q.id === qid ? {
        ...q, choices: (q.choices ?? []).map((c) => c.id === cid ? { ...c, label } : c),
      } : q),
    } : s);
  }
  function patchChoiceRoles(qid: string, cid: string, role_ids: string[]) {
    setSurvey((s) => s ? {
      ...s,
      questions: s.questions.map((q) => q.id === qid ? {
        ...q, choices: (q.choices ?? []).map((c) => c.id === cid ? { ...c, role_ids } : c),
      } : q),
    } : s);
  }

  async function save() {
    if (!survey) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      await actions.setSurveyAdmin(survey);
      setStatus(t("hub.admin.survey.saved"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!survey) return <section><h1>{t("hub.admin.survey.tab_title")}</h1><p className="muted">{t("hub.admin.survey.loading")}</p></section>;

  const requiredCount = survey.questions.filter((q) => q.required).length;

  return (
    <section>
      <h1>{t("hub.admin.survey.title")}</h1>
      <p className="muted">{t("hub.admin.survey.hint")}</p>
      {error && <p className="error-text">{error}</p>}
      {status && <p className="muted">{status}</p>}

      <SettingRow
        step={1}
        title={t("hub.admin.survey.enable")}
        state={survey.enabled ? t("hub.admin.survey.state.on") : t("hub.admin.survey.state.off")}
        {...row("enable")}
      >
        <label className="checkbox-label">
          <input type="checkbox" checked={survey.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          {t("hub.admin.survey.enable")}
        </label>
        <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("hub.admin.survey.autogrant_hint")}</p>
        <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
          <button className="btn-primary" onClick={save} disabled={busy}>{t("hub.admin.survey.save")}</button>
        </div>
      </SettingRow>

      <SettingRow
        step={2}
        title={t("hub.admin.survey.questions_label")}
        state={survey.questions.length === 0
          ? t("hub.admin.survey.state.no_questions")
          : t("hub.admin.survey.state.questions", { count: survey.questions.length, required: requiredCount })}
        meta={survey.questions.length > 0 ? String(survey.questions.length) : undefined}
        {...row("questions")}
      >
        {survey.questions.map((q, i) => (
          <div key={q.id} className="survey-question-edit">
            <div className="settings-row" style={{ alignItems: "center", gap: "var(--space-2)" }}>
              <span className="muted">{i + 1}. {t(`hub.admin.survey.kind.${q.kind}`)}</span>
              <input
                type="text"
                value={q.prompt}
                onChange={(e) => patchQuestion(q.id, { prompt: e.target.value })}
                placeholder={t("hub.admin.survey.prompt_placeholder")}
                aria-label={t("hub.admin.survey.question_aria", { n: i + 1 })}
                style={{ flex: 1 }}
              />
              <label className="checkbox-label" style={{ fontSize: "var(--text-xs)" }}>
                <input type="checkbox" checked={q.required} onChange={(e) => patchQuestion(q.id, { required: e.target.checked })} /> {t("hub.admin.survey.required")}
              </label>
              <button className="btn-small danger" onClick={() => removeQuestion(q.id)}>{t("hub.admin.survey.remove")}</button>
            </div>
            {q.kind === "choice" && (
              <div style={{ paddingLeft: "var(--space-3)", marginTop: 4 }}>
                {(q.choices ?? []).map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 6, flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={c.label}
                      onChange={(e) => patchChoice(q.id, c.id, e.target.value)}
                      placeholder={t("hub.admin.survey.choice_placeholder")}
                      aria-label={t("hub.admin.survey.choice_placeholder")}
                      style={{ width: "100%", maxWidth: 320 }}
                    />
                    <label className="muted" style={{ fontSize: "var(--text-xs)" }} htmlFor={`choice-roles-${c.id}`}>
                      {t("hub.admin.survey.autogrant_roles")}
                    </label>
                    <select
                      id={`choice-roles-${c.id}`}
                      multiple
                      value={c.role_ids}
                      onChange={(e) => patchChoiceRoles(q.id, c.id, Array.from(e.target.selectedOptions).map((o) => o.value))}
                      style={{ minWidth: 160, maxWidth: 240 }}
                      size={Math.min(4, Math.max(2, assignableRoles.length))}
                    >
                      {assignableRoles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button className="btn-small" onClick={() => addChoice(q.id)}>{t("hub.admin.survey.add_choice")}</button>
              </div>
            )}
          </div>
        ))}

        <div className="settings-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn-small" onClick={() => addQuestion("text")}>{t("hub.admin.survey.add_text_question")}</button>
          <button className="btn-small" onClick={() => addQuestion("choice")}>{t("hub.admin.survey.add_choice_question")}</button>
          <span style={{ flex: 1 }} />
          <button className="btn-primary" onClick={save} disabled={busy}>{t("hub.admin.survey.save")}</button>
        </div>
      </SettingRow>

      <SettingRow
        step={3}
        title={t("hub.admin.survey.responses_label")}
        state={responses === null
          ? t("hub.admin.survey.state.answers_unread")
          : responses.length === 0
            ? t("hub.admin.survey.responses_empty")
            : t("hub.admin.survey.state.answers", { count: responses.length })}
        meta={responses && responses.length > 0 ? String(responses.length) : undefined}
        open={showResponses}
        onToggle={toggleResponses}
      >
        {responses === null ? (
          <p className="muted">{t("hub.admin.survey.loading")}</p>
        ) : responses.length === 0 ? (
          <p className="muted">{t("hub.admin.survey.responses_empty")}</p>
        ) : (
          responses.map((r) => (
            <div key={r.response_id} className="survey-response">
              <button
                type="button"
                className="survey-response-head"
                onClick={() => setExpandedResponseId((prev) => (prev === r.response_id ? null : r.response_id))}
                aria-expanded={expandedResponseId === r.response_id}
              >
                <span>
                  <span className="survey-response-name">{r.display_name || t("hub.admin.survey.no_name")}</span>
                  <span className="member-pk">{formatPubkey(r.pubkey)}</span>
                </span>
                <span className="muted">{formatRelative(r.submitted_at)}</span>
              </button>
              {expandedResponseId === r.response_id && (
                <dl className="survey-answer-list">
                  {r.answers.map((a) => (
                    <div key={a.question_id} className="survey-answer-item">
                      <dt className="muted">{a.prompt}</dt>
                      <dd>{a.choice_label ?? a.text_answer ?? <span className="muted">—</span>}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))
        )}
      </SettingRow>
    </section>
  );
}
