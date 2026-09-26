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
