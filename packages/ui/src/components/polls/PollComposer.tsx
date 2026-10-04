import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Poll } from "../../types";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";
import { CloseIcon } from "../Icons";
import { FocusTrap } from "../FocusTrap";

interface Props {
  channelId: string;
  onCreatePoll: (channelId: string, question: string, options: string[]) => Promise<Poll>;
  onCreated: (poll: Poll) => void;
  onClose: () => void;
}

export function PollComposer({ channelId, onCreatePoll, onCreated, onClose }: Props) {
  useCloseOnEscape(onClose);
  const { t } = useTranslation();
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
      setError(t("polls.composer.error_required"));
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
      aria-label={t("channel.ctx.create_poll")}
    >
      <FocusTrap>
        <div
          className="modal modal-form"
          style={{ maxWidth: 420 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: "var(--text-md)", fontWeight: 600 }}>
            {t("channel.ctx.create_poll")}
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label className="settings-label" htmlFor="poll-question">{t("polls.composer.question")}</label>
              <input
                id="poll-question"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("polls.composer.question_placeholder")}
                style={{ width: "100%" }}
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="settings-label">{t("polls.composer.options")}</label>
              {options.map((opt, i) => (
                <div key={opt.id} className="form-row">
                  <input
                    type="text"
                    value={opt.value}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={t("polls.composer.option_placeholder", { n: i + 1 })}
                    maxLength={100}
                    style={{ flex: 1 }}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => removeOption(i)}
                      aria-label={t("polls.composer.remove_option")}
                    >
                      <CloseIcon size={13} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-secondary" onClick={addOption}>
                {t("polls.composer.add_option")}
              </button>
            </div>

            {error && <p className="modal-form-error" role="alert">{error}</p>}

            <div className="modal-form-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                {t("polls.composer.cancel")}
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? t("polls.composer.creating") : t("channel.ctx.create_poll")}
              </button>
            </div>
          </form>
        </div>
      </FocusTrap>
    </div>
  );
}
