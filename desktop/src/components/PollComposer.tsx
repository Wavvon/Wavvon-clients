import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  hubUrl: string;
  channelId: string;
  onCreated: () => void;
  onClose: () => void;
}

export function PollComposer({ hubUrl, channelId, onCreated, onClose }: Props) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = options.filter((o) => o.trim().length > 0);
    if (!question.trim() || filled.length < 2) {
      setError("A question and at least 2 options are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const closesAtTs = closesAt
        ? Math.floor(new Date(closesAt).getTime() / 1000)
        : undefined;
      await invoke("create_poll", {
        hubUrl,
        channelId,
        question: question.trim(),
        options: filled,
        closesAt: closesAtTs ?? null,
      });
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="events-panel-overlay" onClick={onClose}>
      <div
        className="events-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Create poll"
        style={{ maxWidth: 480 }}
      >
        <div className="events-panel-header">
          <span className="events-panel-title">📊 Create Poll</span>
          <button className="events-panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <form className="events-panel-body" onSubmit={handleSubmit} style={{ gap: 12, display: "flex", flexDirection: "column", padding: 16 }}>
          <label className="settings-label">
            Question
            <input
              className="settings-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What's your question?"
              required
            />
          </label>

          <div>
            <div className="settings-label">Options</div>
            {options.map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <input
                  className="settings-input"
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  style={{ flex: 1 }}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="btn-small btn-secondary-small"
                    onClick={() => removeOption(i)}
                    aria-label="Remove option"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-small" onClick={addOption}>
              + Add option
            </button>
          </div>

          <label className="settings-label">
            Closes at (optional)
            <input
              className="settings-input"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </label>

          {error && <div className="events-panel-error">{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create Poll"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
