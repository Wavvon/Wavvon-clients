/** The intervals a channel's slowmode can be set to, in seconds (0 = off). */
export const SLOWMODE_STEPS = [0, 5, 10, 30, 60, 300, 900, 3600, 21600] as const;

/** Seconds left before a slowed channel takes another message, when a send
 *  failed because of slowmode: the hub answers 429 with
 *  `{"error":"slowmode","retry_after_secs":N}`. Null for any other failure. */
export function slowmodeRetryAfter(message: string): number | null {
  try {
    const body = JSON.parse(message) as { error?: unknown; retry_after_secs?: unknown };
    return body.error === "slowmode" && typeof body.retry_after_secs === "number"
      ? body.retry_after_secs
      : null;
  } catch {
    return null;
  }
}
