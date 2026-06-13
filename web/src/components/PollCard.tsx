import React, { useState } from "react";
import type { Poll } from "../types";
import { votePoll, deletePoll } from "@platform";

interface Props {
  poll: Poll;
  isAdmin: boolean;
  onUpdate: (poll: Poll) => void;
  onDelete: (pollId: string) => void;
}

export function PollCard({ poll, isAdmin, onUpdate, onDelete }: Props) {
  const [voting, setVoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVote(optionId: string) {
    setVoting(optionId);
    setError(null);
    try {
      const updated = await votePoll(poll.id, optionId);
      onUpdate(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setVoting(null);
    }
  }

  async function handleDelete() {
    try {
      await deletePoll(poll.id);
      onDelete(poll.id);
    } catch (e) {
      setError(String(e));
    }
  }

  const total = poll.total_votes;

  return (
    <div className="poll-card settings-section" style={{ padding: 14, marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: "var(--text-sm)" }}>{poll.question}</strong>
        {isAdmin && (
          <button
            className="btn-ghost"
            style={{ fontSize: "var(--text-xs)", color: "var(--danger)" }}
            onClick={handleDelete}
            title="Delete poll"
          >
            ✕
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
                  background: opt.voted ? "var(--accent-subtle, rgba(99,102,241,.15))" : "var(--bg-elevated)",
                  transition: "width .4s ease",
                }}
              />
              <span style={{ position: "relative" }}>
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
        {total} {total === 1 ? "vote" : "votes"}
        {poll.ends_at && Date.now() < poll.ends_at * 1000 && (
          <span> · ends {new Date(poll.ends_at * 1000).toLocaleDateString()}</span>
        )}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-xs)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
