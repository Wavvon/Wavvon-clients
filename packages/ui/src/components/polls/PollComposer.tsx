import React, { useState, useRef } from "react";
import type { Poll } from "../../types";

interface Props {
  channelId: string;
  onCreatePoll: (channelId: string, question: string, options: string[]) => Promise<Poll>;
  onCreated: (poll: Poll) => void;
  onClose: () => void;
}

export function PollComposer({ channelId, onCreatePoll, onCreated, onClose }: Props) {
  const [question, setQuestion] = useState("");
  const nextId = useRef(2);
  const [options, setOptions] = useState<{ id: number; value: string }[]>(() => [
    { id: 0, value: "" },
    { id: 1, value: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addOption() {
    const id = nextId.current++;
    setOptions((prev) => [...prev, { id, value: "" }]);
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, value } : o)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = options.map((o) => o.value.trim()).filter(Boolean);
    if (!question.trim() || filled.length < 2) {
      setError("Question and at least 2 options are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const poll = await onCreatePoll(channelId, question.trim(), filled);
      onCreated(poll);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create poll"
    >
      <div
        className="modal-box"
        style={{ maxWidth: 420, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "var(--text-md)", fontWeight: 600 }}>
          Create poll
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="settings-section" style={{ marginBottom: 12 }}>
            <label className="settings-label">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question…"
              style={{ width: "100%" }}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="settings-section" style={{ marginBottom: 12 }}>
            <label className="settings-label">Options</label>
            {options.map((opt, i) => (
              <div key={opt.id} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  type="text"
                  value={opt.value}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={100}
                  style={{ flex: 1 }}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => removeOption(i)}
                    aria-label="Remove option"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={addOption} style={{ marginTop: 4 }}>
              + Add option
            </button>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginBottom: 8 }}>{error}</p>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create poll"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
