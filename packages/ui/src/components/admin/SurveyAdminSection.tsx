import { Fragment, useEffect, useState } from "react";
import { formatPubkey, formatRelative } from "@wavvon/core";
import type { SurveyAdmin, SurveyQuestion, SurveyChoice, SurveyResponseView } from "../../types";

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
  const [survey, setSurvey] = useState<SurveyAdmin | null>(null);
  const [responses, setResponses] = useState<SurveyResponseView[] | null>(null);
  const [showResponses, setShowResponses] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignableRoles, setAssignableRoles] = useState<{ id: string; name: string }[]>([]);

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
    if (next && responses === null) void loadResponses();
  }

  function patch(next: Partial<SurveyAdmin>) {
    setSurvey((s) => (s ? { ...s, ...next } : s));
  }
  function patchQuestion(qid: string, p: Partial<SurveyQuestion>) {
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
        const choices: SurveyChoice[] = [...(q.choices ?? []), { id: uid(), label: "", display_order: (q.choices?.length ?? 0), role_ids: [] }];
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
      setStatus("Survey saved");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!survey) return <section><h1>Survey</h1><p className="muted">Loading…</p></section>;

  return (
    <section>
      <h1>Onboarding survey</h1>
      <p className="muted">New members answer this when they join.</p>
      {error && <p className="error-text">{error}</p>}
      {status && <p className="muted">{status}</p>}

      <label className="checkbox-label">
        <input type="checkbox" checked={survey.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        Enable this survey
      </label>
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
        Roles assigned to choices below are granted automatically on submission, but only when every
        question the member answered is multiple-choice. Surveys with any free-text answer go to manual
        review instead.
      </p>

      {survey.questions.map((q, i) => (
        <div key={q.id} className="settings-section" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "var(--space-2)" }}>
          <div className="settings-row" style={{ alignItems: "center", gap: "var(--space-2)" }}>
            <span className="muted">{i + 1}. {q.kind}</span>
            <input
              type="text"
              value={q.prompt}
              onChange={(e) => patchQuestion(q.id, { prompt: e.target.value })}
              placeholder="Question prompt"
              aria-label={`Question ${i + 1} prompt`}
              style={{ flex: 1 }}
            />
            <label className="checkbox-label" style={{ fontSize: "var(--text-xs)" }}>
              <input type="checkbox" checked={q.required} onChange={(e) => patchQuestion(q.id, { required: e.target.checked })} /> required
            </label>
            <button className="btn-small btn-secondary danger" onClick={() => removeQuestion(q.id)}>Remove</button>
          </div>
          {q.kind === "choice" && (
            <div style={{ paddingLeft: "var(--space-3)", marginTop: 4 }}>
              {(q.choices ?? []).map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 6, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => patchChoice(q.id, c.id, e.target.value)}
                    placeholder="Choice label"
                    aria-label="Choice label"
                    style={{ width: "100%", maxWidth: 320 }}
                  />
                  <label className="muted" style={{ fontSize: "var(--text-xs)" }} htmlFor={`choice-roles-${c.id}`}>
                    Auto-grant roles
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
              <button className="btn-small btn-secondary" onClick={() => addChoice(q.id)}>+ Add choice</button>
            </div>
          )}
        </div>
      ))}

      <div className="settings-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <button className="btn-secondary" onClick={() => addQuestion("text")}>+ Text question</button>
        <button className="btn-secondary" onClick={() => addQuestion("choice")}>+ Choice question</button>
        <span style={{ flex: 1 }} />
        <button onClick={save} disabled={busy}>Save survey</button>
      </div>

      <div className="settings-section" style={{ marginTop: "var(--space-4)" }}>
        <button className="btn-secondary" onClick={toggleResponses}>
          {showResponses ? "Hide responses" : "View responses"}
        </button>
        {showResponses && (
          responses === null ? (
            <p className="muted">Loading…</p>
          ) : responses.length === 0 ? (
            <p className="muted">No responses yet.</p>
          ) : (
            <table className="members-table" style={{ marginTop: "var(--space-3)" }}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r) => (
                  <Fragment key={r.response_id}>
                    <tr
                      key={r.response_id}
                      className="survey-response-row"
                      onClick={() => setExpandedResponseId((prev) => (prev === r.response_id ? null : r.response_id))}
                    >
                      <td>
                        <div>{r.display_name || <span className="muted">(no name)</span>}</div>
                        <div className="member-pk">{formatPubkey(r.pubkey)}</div>
                      </td>
                      <td>{formatRelative(r.submitted_at)}</td>
                    </tr>
                    {expandedResponseId === r.response_id && (
                      <tr key={`${r.response_id}-answers`}>
                        <td colSpan={2}>
                          <dl className="survey-answer-list">
                            {r.answers.map((a) => (
                              <div key={a.question_id} className="survey-answer-item">
                                <dt className="muted">{a.prompt}</dt>
                                <dd>{a.choice_label ?? a.text_answer ?? <span className="muted">—</span>}</dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </section>
  );
}
