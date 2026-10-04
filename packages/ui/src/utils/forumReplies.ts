import type { ReplyView } from "../types";

/** Merges a fetched page into the replies already shown: replies seen before
 * are replaced in place (fresh edits/reactions), unseen ones are appended. */
export function mergeReplies(existing: ReplyView[], page: ReplyView[]): ReplyView[] {
  const fresh = new Map(page.map((r) => [r.id, r]));
  const seen = new Set(existing.map((r) => r.id));
  return [...existing.map((r) => fresh.get(r.id) ?? r), ...page.filter((r) => !seen.has(r.id))];
}
