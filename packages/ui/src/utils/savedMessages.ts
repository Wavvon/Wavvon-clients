/** A message bookmarked into the personal "Saved" list. Personal-axis state:
 *  it rides the synced settings on the home hub, never the community hub, so
 *  it carries enough to show and reopen the message without asking anyone. */
export interface SavedMessage {
  hub_id: string;
  hub_url: string;
  hub_name?: string;
  channel_id: string;
  channel_name?: string;
  message_id: string;
  author?: string;
  excerpt: string;
  /** When the message was written (epoch ms). */
  message_at?: number;
  saved_at: number;
  /** Set once a delete of the message was seen; the entry stays, marked. */
  deleted?: boolean;
}

export const SAVED_EXCERPT_LEN = 200;
export const SAVED_LIMIT = 500;

export function savedKey(s: { hub_id: string; message_id: string }): string {
  return `${s.hub_id}:${s.message_id}`;
}

/** Parse the stored list, dropping anything that is not an entry. */
export function parseSaved(raw: string | null): SavedMessage[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is SavedMessage =>
      !!x && typeof x === "object" &&
      typeof (x as SavedMessage).hub_id === "string" &&
      typeof (x as SavedMessage).message_id === "string" &&
      typeof (x as SavedMessage).channel_id === "string" &&
      typeof (x as SavedMessage).saved_at === "number");
  } catch {
    return [];
  }
}

/** Newest first; saving one already saved removes it. The list is capped
 *  because it travels inside the prefs blob on every sync. */
export function toggleSaved(list: SavedMessage[], entry: SavedMessage): SavedMessage[] {
  const key = savedKey(entry);
  if (list.some((s) => savedKey(s) === key)) return list.filter((s) => savedKey(s) !== key);
  const trimmed = { ...entry, excerpt: entry.excerpt.slice(0, SAVED_EXCERPT_LEN) };
  return [trimmed, ...list].slice(0, SAVED_LIMIT);
}

export function markSavedDeleted(list: SavedMessage[], hubId: string, messageId: string): SavedMessage[] {
  if (!list.some((s) => s.hub_id === hubId && s.message_id === messageId && !s.deleted)) return list;
  return list.map((s) => (s.hub_id === hubId && s.message_id === messageId ? { ...s, deleted: true } : s));
}
