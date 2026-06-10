import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SurveyAdmin, SurveyQuestionAdmin, SurveyChoiceAdmin, SurveyResponseAdmin } from "../types";
import { formatPubkey, formatRelative } from "@voxply/utils";

function blankQuestion(): SurveyQuestionAdmin {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    kind: "choice",
    required: true,
    display_order: 0,
    choices: [],
  };
}

function blankChoice(): SurveyChoiceAdmin {
  return {
    id: crypto.randomUUID(),
    label: "",
    display_order: 0,
    role_ids: [],
  };
}

function blankSurvey(): SurveyAdmin {
  return { id: crypto.randomUUID(), enabled: false, questions: [] };
}

type RightPanel = "editor" | "responses";

export function SurveyAdminSection({ hubUrl }: { hubUrl: string }) {
  const [survey, setSurvey] = useState<SurveyAdmin>(blankSurvey());
  const [selectedQId, setSelectedQId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("editor");
  const [responses, setResponses] = useState<SurveyResponseAdmin[]>([]);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);

  useEffect(() => {
    invoke<SurveyAdmin | null>("survey_admin_get", { hubUrl })
      .then((s) => { if (s) setSurvey(s); })
      .catch(() => {});
  }, [hubUrl]);

  useEffect(() => {
    if (rightPanel !== "responses") return;
    setLoadingResponses(true);
    invoke<SurveyResponseAdmin[]>("survey_admin_responses", { hubUrl, status: "all" })
      .then((r) => setResponses(r))
      .catch(() => setResponses([]))
      .finally(() => setLoadingResponses(false));
  }, [rightPanel, hubUrl]);

  const selectedQ = survey.questions.find((q) => q.id === selectedQId) ?? null;

  function updateQuestion(qId: string, patch: Partial<SurveyQuestionAdmin>) {
    setSurvey((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => q.id === qId ? { ...q, ...patch } : q),
    }));
  }

  function addQuestion() {
    const q = blankQuestion();
    q.display_order = survey.questions.length;
    setSurvey((prev) => ({ ...prev, questions: [...prev.questions, q] }));
    setSelectedQId(q.id);
    setRightPanel("editor");
  }

  function deleteQuestion(qId: string) {
    setSurvey((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== qId),
    }));
    if (selectedQId === qId) setSelectedQId(null);
  }

  function addChoice(qId: string) {
    const c = blankChoice();
    updateQuestion(qId, {
      choices: [
        ...(survey.questions.find((q) => q.id === qId)?.choices ?? []),
        { ...c, display_order: (survey.questions.find((q) => q.id === qId)?.choices?.length ?? 0) },
      ],
    });
  }

  function updateChoice(qId: string, cId: string, patch: Partial<SurveyChoiceAdmin>) {
    const q = survey.questions.find((q) => q.id === qId);
    if (!q) return;
    updateQuestion(qId, {
      choices: (q.choices ?? []).map((c) => c.id === cId ? { ...c, ...patch } : c),
    });
  }

  function deleteChoice(qId: string, cId: string) {
    const q = survey.questions.find((q) => q.id === qId);
    if (!q) return;
    updateQuestion(qId, { choices: (q.choices ?? []).filter((c) => c.id !== cId) });
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await invoke("survey_admin_put", { hubUrl, survey });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  const hasTextQuestion = survey.questions.some((q) => q.kind === "text");
  const sorted = survey.questions.slice().sort((a, b) => a.display_order - b.display_order);

  return (
    <section>
      <h1>Onboarding Survey</h1>
      <p className="muted">
        Define questions new members answer when joining. Multiple-choice answers
        can auto-apply roles.
      </p>

      <div className="survey-admin-layout">
        <div className="survey-question-list">
          {sorted.map((q) => (
            <button
              key={q.id}
              className={`survey-question-item${selectedQId === q.id && rightPanel === "editor" ? " active" : ""}`}
              onClick={() => { setSelectedQId(q.id); setRightPanel("editor"); }}
            >
              <span className="survey-question-item-prompt">
                {q.prompt || <span className="muted">(no prompt)</span>}
              </span>
              <span className="survey-question-item-kind muted">{q.kind}</span>
            </button>
          ))}
          <button className="survey-list-add btn-secondary" onClick={addQuestion}>
            + Add question
          </button>
        </div>

        <div className="survey-question-editor">
          <div className="survey-editor-tabs">
            <button
              className={`survey-editor-tab${rightPanel === "editor" ? " active" : ""}`}
              onClick={() => setRightPanel("editor")}
            >
              Editor
            </button>
            <button
              className={`survey-editor-tab${rightPanel === "responses" ? " active" : ""}`}
              onClick={() => { setSelectedQId(null); setRightPanel("responses"); }}
            >
              Responses
            </button>
          </div>

          {rightPanel === "editor" && selectedQ && (
            <div className="survey-editor-panel">
              <div className="settings-section">
                <label className="settings-label">Prompt</label>
                <textarea
                  rows={2}
                  value={selectedQ.prompt}
                  onChange={(e) => updateQuestion(selectedQ.id, { prompt: e.target.value })}
                  placeholder="Ask a question…"
                />
              </div>

              <div className="settings-section">
                <label className="settings-label">Type</label>
                <div className="survey-kind-toggle">
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name={`kind-${selectedQ.id}`}
                      checked={selectedQ.kind === "choice"}
                      onChange={() => updateQuestion(selectedQ.id, { kind: "choice" })}
                    />
                    Multiple choice
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name={`kind-${selectedQ.id}`}
                      checked={selectedQ.kind === "text"}
                      onChange={() => updateQuestion(selectedQ.id, { kind: "text" })}
                    />
                    Free text
                  </label>
                </div>
                {selectedQ.kind === "text" && (
                  <p className="muted survey-text-warning">
                    Free-text answers require manual admin review.
                  </p>
                )}
              </div>

              <div className="settings-section">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedQ.required}
                    onChange={(e) => updateQuestion(selectedQ.id, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>

              {selectedQ.kind === "choice" && (
                <div className="settings-section">
                  <label className="settings-label">Choices</label>
                  {(selectedQ.choices ?? [])
                    .slice()
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((c) => (
                      <div key={c.id} className="survey-choice-row">
                        <input
                          type="text"
                          value={c.label}
                          onChange={(e) => updateChoice(selectedQ.id, c.id, { label: e.target.value })}
                          placeholder="Choice label"
                        />
                        <input
                          type="text"
                          value={c.role_ids.join(", ")}
                          onChange={(e) =>
                            updateChoice(selectedQ.id, c.id, {
                              role_ids: e.target.value.split(",").map((r) => r.trim()).filter(Boolean),
                            })
                          }
                          placeholder="Role IDs (comma-separated)"
                          className="survey-choice-roles"
                        />
                        <button
                          className="btn-small"
                          onClick={() => deleteChoice(selectedQ.id, c.id)}
                          title="Remove choice"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  <button className="btn-secondary survey-add-choice" onClick={() => addChoice(selectedQ.id)}>
                    + Add choice
                  </button>
                </div>
              )}

              <div className="settings-section">
                <button
                  className="btn-secondary"
                  onClick={() => deleteQuestion(selectedQ.id)}
                >
                  Delete question
                </button>
              </div>
            </div>
          )}

          {rightPanel === "editor" && !selectedQ && (
            <div className="survey-editor-empty">
              <p className="muted">Select a question to edit, or add a new one.</p>
            </div>
          )}

          {rightPanel === "responses" && (
            <div className="survey-responses-panel">
              {loadingResponses ? (
                <p className="muted">Loading…</p>
              ) : responses.length === 0 ? (
                <p className="muted">No responses yet.</p>
              ) : (
                <table className="members-table survey-responses-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((r) => (
                      <>
                        <tr
                          key={r.response_id}
                          className="survey-response-row"
                          onClick={() =>
                            setExpandedResponseId((prev) =>
                              prev === r.response_id ? null : r.response_id
                            )
                          }
                        >
                          <td>
                            <div>{r.display_name || <span className="muted">(no name)</span>}</div>
                            <div className="member-pk">{formatPubkey(r.pubkey)}</div>
                          </td>
                          <td>{formatRelative(r.submitted_at)}</td>
                        </tr>
                        {expandedResponseId === r.response_id && (
                          <tr key={`${r.response_id}-answers`}>
                            <td colSpan={2} className="survey-response-answers">
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
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="settings-section survey-bottom-bar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={survey.enabled}
            onChange={(e) => setSurvey((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          Enable survey
        </label>
        {hasTextQuestion && (
          <p className="muted survey-text-warning">
            This survey contains free-text questions — joiners will be routed to manual review.
          </p>
        )}
        {saveMsg && <p className="muted">{saveMsg}</p>}
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
