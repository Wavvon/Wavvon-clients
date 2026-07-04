import { useEffect, useState } from "react";
import { getSurveyAdmin, setSurveyAdmin, getSurveyResponses } from "@platform";
import type { SurveyAdmin, SurveyQuestion, SurveyChoice } from "@platform";
import { HubApiError } from "../platform/http";

function uid(): string {
  try { return crypto.randomUUID(); } catch { return `s-${Date.now()}-${Math.floor(Math.random() * 1e9)}`; }
}

// Onboarding survey builder. New members answer it; choice answers can grant
// roles (role assignment on choices is a further follow-up — this builds the
// questions/choices and enables the survey).
export function SurveyAdminSection() {
  const [survey, setSurvey] = useState<SurveyAdmin | null>(null);
  const [responseCount, setResponseCount] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSurveyAdmin();
        setSurvey(s ?? { id: uid(), enabled: false, questions: [] });
        setResponseCount((await getSurveyResponses()).length);
      } catch (e) {
        setError(e instanceof HubApiError ? e.message : String(e));
        setSurvey({ id: uid(), enabled: false, questions: [] });
      }
    })();
  }, []);

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

  async function save() {
    if (!survey) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      await setSurveyAdmin(survey);
      setStatus("Survey saved");
    } catch (e) {
      setError(e instanceof HubApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!survey) return <section><h1>Survey</h1><p className="muted">Loading…</p></section>;

  return (
    <section>
      <h1>Onboarding survey</h1>
      <p className="muted">New members answer this when they join.{responseCount !== null && ` ${responseCount} response(s) so far.`}</p>
      {error && <p className="error-text">{error}</p>}
      {status && <p className="muted">{status}</p>}

      <label className="checkbox-label">
        <input type="checkbox" checked={survey.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        Enable this survey
      </label>

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
                <input
                  key={c.id}
                  type="text"
                  value={c.label}
                  onChange={(e) => patchChoice(q.id, c.id, e.target.value)}
                  placeholder="Choice label"
                  aria-label="Choice label"
                  style={{ display: "block", marginBottom: 4, width: "100%", maxWidth: 320 }}
                />
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
    </section>
  );
}
