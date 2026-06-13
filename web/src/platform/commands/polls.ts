import { hubFetch } from "../http";
import type { Poll } from "@shared/types";

export async function createPoll(
  channelId: string,
  question: string,
  options: string[],
  endsAt?: number,
): Promise<Poll> {
  const optionObjects = options.map((text, i) => ({ id: String(i), text }));
  const res = await hubFetch(`/channels/${channelId}/polls`, {
    method: "POST",
    body: JSON.stringify({ question, options: optionObjects, ends_at: endsAt ?? null }),
  });
  const raw = await res.json() as Record<string, unknown>;
  const rawOptions: Array<{ id: string; text: string }> =
    typeof raw.options === "string" ? JSON.parse(raw.options as string) : (raw.options as Array<{ id: string; text: string }>);
  const poll: Poll = {
    id: raw.id as string,
    channel_id: raw.channel_id as string,
    question: raw.question as string,
    options: rawOptions.map((o) => ({ id: o.id, text: o.text, vote_count: 0, voted: false })),
    total_votes: 0,
    created_by: (raw.creator_pubkey ?? "") as string,
    created_at: raw.created_at as number,
    ends_at: (raw.ends_at ?? null) as number | null,
    is_deleted: false,
  };
  return poll;
}

export async function getPolls(channelId: string): Promise<Poll[]> {
  const res = await hubFetch(`/channels/${channelId}/polls`);
  return res.json() as Promise<Poll[]>;
}

export async function votePoll(pollId: string, optionId: string): Promise<Poll> {
  await hubFetch(`/polls/${pollId}/vote`, {
    method: "POST",
    body: JSON.stringify({ option_ids: [optionId] }),
  });
  const updated = await hubFetch(`/polls/${pollId}`);
  const raw = await updated.json() as Record<string, unknown>;
  const rawPoll = raw.poll as Record<string, unknown>;
  const rawOptions: Array<{ id: string; text: string }> =
    typeof rawPoll.options === "string" ? JSON.parse(rawPoll.options as string) : (rawPoll.options as Array<{ id: string; text: string }>);
  const totals = (raw.totals ?? {}) as Record<string, number>;
  const yourVote = (raw.your_vote ?? []) as string[];
  const totalVotes = Object.values(totals).reduce((s, v) => s + v, 0);
  const poll: Poll = {
    id: rawPoll.id as string,
    channel_id: rawPoll.channel_id as string,
    question: rawPoll.question as string,
    options: rawOptions.map((o) => ({
      id: o.id,
      text: o.text,
      vote_count: totals[o.id] ?? 0,
      voted: yourVote.includes(o.id),
    })),
    total_votes: totalVotes,
    created_by: (rawPoll.creator_pubkey ?? "") as string,
    created_at: rawPoll.created_at as number,
    ends_at: (rawPoll.ends_at ?? null) as number | null,
    is_deleted: false,
  };
  return poll;
}

export async function deletePoll(pollId: string): Promise<void> {
  await hubFetch(`/polls/${pollId}`, { method: "DELETE" });
}
