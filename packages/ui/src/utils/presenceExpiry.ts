export type PresenceStatus = "online" | "away" | "dnd" | "invisible";

/** What is persisted for own presence: the status, and when it reverts.
 *  `until` is an absolute epoch-ms deadline rather than a remaining duration,
 *  because the thing that has to survive is a point in time — a duration
 *  restarts every time it is written back. */
export interface StoredPresence {
  status: PresenceStatus;
  until?: number;
}

const AWAY_STATES: PresenceStatus[] = ["away", "dnd", "invisible"];

/** Read persisted presence, applying the deadline.
 *
 *  A "clear after" used to be a `setTimeout` and nothing else, so it lived
 *  only as long as the page did: set Away for an hour, reload, and you were
 *  Away until you noticed and changed it by hand. A deadline in storage is
 *  what makes the promise survive the reload that breaks a timer.
 *
 *  Returns the status to apply and, when there is still time left, the
 *  milliseconds to wait before reverting. An expired or malformed record is
 *  online — the safe direction, since the alternative is telling everyone you
 *  are away when you are not. */
export function resolveStoredPresence(
  raw: string | null,
  now: number = Date.now(),
): { status: PresenceStatus; revertAfterMs: number | null } {
  const online = { status: "online" as PresenceStatus, revertAfterMs: null };
  if (!raw) return online;

  let parsed: { status?: unknown; until?: unknown };
  try {
    parsed = JSON.parse(raw) as { status?: unknown; until?: unknown };
  } catch {
    return online;
  }

  const status = parsed.status;
  if (typeof status !== "string" || !AWAY_STATES.includes(status as PresenceStatus)) {
    return online;
  }

  const until = parsed.until;
  if (typeof until !== "number" || !Number.isFinite(until)) {
    // No deadline: an indefinite Away, which is a real choice and stays.
    return { status: status as PresenceStatus, revertAfterMs: null };
  }
  if (until <= now) return online;
  return { status: status as PresenceStatus, revertAfterMs: until - now };
}

/** The record to persist for a status change. Only a non-online status can
 *  carry a deadline; "revert to online in an hour" is not a thing. */
export function storedPresenceFor(
  status: PresenceStatus,
  ttlMinutes: number | null,
  now: number = Date.now(),
): StoredPresence {
  if (status === "online" || !ttlMinutes || ttlMinutes <= 0) return { status };
  return { status, until: now + ttlMinutes * 60_000 };
}
