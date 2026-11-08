// Wire types for the app surface: what a registered app puts on a message.

/** An app-authored "Play" launch card, carried on `Message.game`. */
export interface GameLaunchCard {
  entry_url: string;
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
}

/** Defensive parse for a `game` field lifted off an untyped message/WS
 *  payload -- a malformed or partial value degrades to "no launch card"
 *  instead of a broken render. */
export function parseGameLaunchCard(raw: unknown): GameLaunchCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.entry_url !== "string" || !r.entry_url) return null;
  if (typeof r.name !== "string" || !r.name) return null;
  return {
    entry_url: r.entry_url,
    name: r.name,
    description: typeof r.description === "string" ? r.description : null,
    thumbnail_url: typeof r.thumbnail_url === "string" ? r.thumbnail_url : null,
  };
}

// A hub answers the user's own `app_join` with `app_open`. An `app_open`
// nobody asked for would open a page the hub chose, full-window, so it is
// honoured only for an app this client joined in the last minute.
const APP_JOIN_WINDOW_MS = 60_000;
const appJoins = new Map<string, number>();

export function noteAppJoin(appId: string, now: number = Date.now()): void {
  appJoins.set(appId, now);
}

/** True once per join, and only within the window. */
export function takeAppJoin(appId: string, now: number = Date.now()): boolean {
  const at = appJoins.get(appId);
  appJoins.delete(appId);
  return at !== undefined && now - at <= APP_JOIN_WINDOW_MS;
}

/** The host a mini-app URL points at, shown so the user can see where the
 *  page comes from. */
export function miniAppHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
