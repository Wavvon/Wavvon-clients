import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Poll } from "../../types";
import { CloseIcon } from "../Icons";
import { useConfirm } from "../ConfirmDialog";
import { formatDate } from "@wavvon/core";

interface Props {
  poll: Poll;
  isAdmin: boolean;
  onVote: (pollId: string, optionId: string) => Promise<Poll>;
  onUpdate: (poll: Poll) => void;
  onDeletePoll: (pollId: string) => Promise<void>;
  onDelete: (pollId: string) => void;
}

export function PollCard({ poll, isAdmin, onVote, onUpdate, onDeletePoll, onDelete }: Props) {
  const { t } = useTranslation();
  const [voting, setVoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  async function handleVote(optionId: string) {
    setVoting(optionId);
    setError(null);
    try {
      const updated = await onVote(poll.id, optionId);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVoting(null);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t("polls.card.delete_confirm_title"),
      body: t("polls.card.delete_confirm_body"),
      confirmLabel: t("polls.card.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await onDeletePoll(poll.id);
      onDelete(poll.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const total = poll.total_votes;

  return (
    <div className="poll-card" style={{ padding: 14, marginTop: 8 }}>
      {dialog}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: "var(--text-sm)" }}>{poll.question}</strong>
        {isAdmin && (
          <button
            className="btn-ghost"
            style={{ fontSize: "var(--text-xs)", color: "var(--danger)" }}
            onClick={handleDelete}
            title={t("polls.card.delete")}
            aria-label={t("polls.card.delete")}
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {poll.options.map((opt) => {
          const pct = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
          return (
            <button
              key={opt.id}
              className={opt.voted ? "poll-option poll-option--voted" : "poll-option"}
              disabled={voting !== null}
              onClick={() => handleVote(opt.id)}
              style={{
                position: "relative",
                overflow: "hidden",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: "var(--r-sm)",
                border: opt.voted ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: "var(--surface)",
                cursor: voting !== null ? "wait" : "pointer",
                fontSize: "var(--text-sm)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: opt.voted ? "var(--accent-wash)" : "var(--bg-elevated)",
                  transition: "width .4s ease",
                }}
              />
              <span style={{ position: "relative", display: "block", paddingRight: 44 }}>
                {opt.text}
              </span>
              <span
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                }}
              >
                {pct}%
              </span>
            </button>
          );
        })}
      </div>

      <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
        {t("polls.card.votes", { count: total })}
        {poll.ends_at && Date.now() < poll.ends_at * 1000 && (
          <span> · {t("polls.card.ends", { date: formatDate(poll.ends_at) })}</span>
        )}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-xs)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
