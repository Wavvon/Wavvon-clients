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
  /** "Remind me": an absolute epoch-ms due time, never a bare timer, so a
   *  reload or another device keeps it. */
  remind_at?: number;
  /** The reminder has fired; it stays listed until dismissed. */
  reminded?: boolean;
  /** Added by a reminder alone: dismissing it drops the entry too. */
  remind_only?: boolean;
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

export const REMIND_IN = ["20m", "1h", "3h", "tomorrow"] as const;
export type RemindIn = (typeof REMIND_IN)[number];

/** When a reminder picked now is due. "Tomorrow" is 09:00 local time. */
export function remindDeadline(choice: RemindIn, now: Date = new Date()): number {
  const t = now.getTime();
  switch (choice) {
    case "20m": return t + 20 * 60_000;
    case "1h": return t + 60 * 60_000;
    case "3h": return t + 3 * 60 * 60_000;
    case "tomorrow": {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    }
  }
}

/** Set a reminder on a saved message, or save it for the reminder alone. */
export function setReminder(list: SavedMessage[], entry: SavedMessage, at: number): SavedMessage[] {
  const key = savedKey(entry);
  if (list.some((s) => savedKey(s) === key)) {
    return list.map((s) => (savedKey(s) === key ? { ...s, remind_at: at, reminded: false } : s));
  }
  const added = { ...entry, excerpt: entry.excerpt.slice(0, SAVED_EXCERPT_LEN), remind_at: at, remind_only: true };
  return [added, ...list].slice(0, SAVED_LIMIT);
}

/** Dismiss a reminder; an entry that only existed for it goes too. */
export function dismissReminder(list: SavedMessage[], key: string): SavedMessage[] {
  return list.flatMap((s) => {
    if (savedKey(s) !== key) return [s];
    if (s.remind_only) return [];
    const rest = { ...s };
    delete rest.remind_at;
    delete rest.reminded;
    return [rest];
  });
}

/** Reminders that are due and have not fired, and the next one ahead. */
export function dueReminders(list: SavedMessage[], now: number = Date.now()): { due: SavedMessage[]; next: number | null } {
  const due: SavedMessage[] = [];
  let next: number | null = null;
  for (const s of list) {
    if (s.remind_at === undefined || s.reminded) continue;
    if (s.remind_at <= now) due.push(s);
    else if (next === null || s.remind_at < next) next = s.remind_at;
  }
  return { due, next };
}

export function markReminded(list: SavedMessage[], keys: Set<string>): SavedMessage[] {
  return list.map((s) => (keys.has(savedKey(s)) ? { ...s, reminded: true } : s));
}

/** Newest first; saving one already saved removes it. The list is capped
 *  because it travels inside the prefs blob on every sync. */
export function toggleSaved(list: SavedMessage[], entry: SavedMessage): SavedMessage[] {
  const key = savedKey(entry);
  const existing = list.find((s) => savedKey(s) === key);
  // Saving a message held only for its reminder keeps it, now saved.
  if (existing?.remind_only) return list.map((s) => (s === existing ? { ...s, remind_only: false } : s));
  if (existing) return list.filter((s) => savedKey(s) !== key);
  const trimmed = { ...entry, excerpt: entry.excerpt.slice(0, SAVED_EXCERPT_LEN) };
  return [trimmed, ...list].slice(0, SAVED_LIMIT);
}

export function markSavedDeleted(list: SavedMessage[], hubId: string, messageId: string): SavedMessage[] {
  if (!list.some((s) => s.hub_id === hubId && s.message_id === messageId && !s.deleted)) return list;
  return list.map((s) => (s.hub_id === hubId && s.message_id === messageId ? { ...s, deleted: true } : s));
}

/** An OS notification for a due reminder, where the page may show one;
 *  clicking it brings the window forward and opens the message. */
export function notifyReminder(s: SavedMessage, title: string, onOpen: (s: SavedMessage) => void): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body: s.deleted ? undefined : s.excerpt.slice(0, 100), tag: `remind:${savedKey(s)}` });
    n.onclick = () => { window.focus(); onOpen(s); n.close(); };
  } catch { /* the page may not construct notifications (a service-worker-only browser) */ }
}
