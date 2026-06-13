import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface LegacyPollOption {
  id: string;
  text: string;
}

export interface LegacyPoll {
  id: string;
  channel_id: string;
  creator_pubkey: string;
  question: string;
  /** JSON-encoded LegacyPollOption[] */
  options: string;
  ends_at?: number;
  max_choices: number;
  created_at: number;
  totals: Record<string, number>;
  your_vote?: string[];
}

interface PollVoteUpdatedPayload {
  hub_id: string;
  channel_id: string;
  poll_id: string;
  totals: Record<string, number>;
}

interface Props {
  poll: LegacyPoll;
  hubId: string;
  hubUrl?: string;
  myPubkey?: string | null;
  isAdmin?: boolean;
  onDeleted?: (pollId: string) => void;
}

function parsedOptions(raw: string): LegacyPollOption[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function isExpired(ends_at?: number): boolean {
  if (!ends_at) return false;
  return Date.now() / 1000 > ends_at;
}

function formatEndsAt(ends_at?: number): string | null {
  if (!ends_at) return null;
  const now = Date.now() / 1000;
  const diff = ends_at - now;
  if (diff <= 0) return "Poll ended";
  if (diff < 3600) return `ends in ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `ends in ${Math.round(diff / 3600)}h`;
  return `ends ${new Date(ends_at * 1000).toLocaleDateString()}`;
}

export function PollCard({ poll, hubId, hubUrl, myPubkey, isAdmin, onDeleted }: Props) {
  const options = parsedOptions(poll.options);
  const [totals, setTotals] = useState<Record<string, number>>(poll.totals ?? {});
  const [yourVote, setYourVote] = useState<string[]>(poll.your_vote ?? []);
  const [busy, setBusy] = useState(false);
  const expired = isExpired(poll.ends_at);

  const totalVotes = Object.values(totals).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const unlisten = listen<PollVoteUpdatedPayload>("poll-vote-updated", (event) => {
      const payload = event.payload;
      if (payload.hub_id === hubId && payload.poll_id === poll.id) {
        const converted: Record<string, number> = {};
        for (const [k, v] of Object.entries(payload.totals)) {
          converted[k] = typeof v === "number" ? v : Number(v);
        }
        setTotals(converted);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [hubId, poll.id]);

  async function vote(optionId: string) {
    if (busy || expired) return;
    const newVote = [optionId];
    setBusy(true);
    try {
      await invoke("vote_poll", { pollId: poll.id, optionIds: newVote });
      setYourVote(newVote);
      setTotals((prev) => {
        const next = { ...prev };
        next[optionId] = (next[optionId] ?? 0) + 1;
        return next;
      });
    } catch (e) {
      console.error("Vote failed:", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!hubUrl) return;
    try {
      await invoke("delete_poll", { hubUrl, pollId: poll.id });
      onDeleted?.(poll.id);
    } catch (e) {
      console.error("Delete poll failed:", e);
    }
  }

  const canDelete =
    isAdmin || (myPubkey != null && poll.creator_pubkey === myPubkey);

  return (
    <div className="poll-card">
      <div className="poll-card-header">
        <span className="poll-card-icon">📊</span>
        <span className="poll-card-question">{poll.question}</span>
        {canDelete && hubUrl && (
          <button
            className="btn-small btn-secondary-small"
            style={{ marginLeft: "auto" }}
            onClick={handleDelete}
            title="Delete poll"
          >
            ✕
          </button>
        )}
      </div>
      <div className="poll-card-options">
        {options.map((opt) => {
          const count = totals[opt.id] ?? 0;
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const voted = yourVote.includes(opt.id);
          return (
            <div key={opt.id} className={`poll-option${voted ? " poll-option-voted" : ""}`}>
              <button
                className="poll-option-btn"
                disabled={expired || busy}
                onClick={() => vote(opt.id)}
              >
                <span className="poll-option-text">{opt.text}</span>
                <span className="poll-option-pct">{Math.round(pct)}%</span>
              </button>
              <div className="poll-option-bar-track">
                <div
                  className="poll-option-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="poll-option-count">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="poll-card-footer">
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
        {poll.ends_at && (
          <span className="poll-card-ends"> · {formatEndsAt(poll.ends_at)}</span>
        )}
        {yourVote.length > 0 && (
          <span className="poll-card-your-vote"> · you voted</span>
        )}
      </div>
    </div>
  );
}
