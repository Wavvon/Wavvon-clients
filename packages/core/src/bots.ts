// Bot-capability-layer wire types (bot-capability-layer.md §1, §2, §6 Phase 1).

/** The five capabilities a bot can request and an admin can grant. Baseline
 *  UI (components, embeds, the launch card itself) is ungated and never
 *  appears here. */
export type BotCapability =
  | "can_read_message_content"
  | "can_use_interactive_ui"
  | "can_speak_voice"
  | "can_inject_video"
  | "can_use_camera";

/** `GET /admin/bots/:pubkey/capabilities` response. `requested` is
 *  self-declared by the bot, `granted` is admin-set, `effective` is the
 *  intersection the runtime actually gates on (requested ∩ granted). */
export interface BotCapabilityGrants {
  requested: string[];
  granted: string[];
  effective: string[];
}

/** Builds the next granted set for a single capability toggle -- the body
 *  for `PUT /admin/bots/:pubkey/capabilities`, which replaces the whole
 *  grant set atomically. */
export function toggleBotCapability(
  granted: string[],
  capability: string,
  enabled: boolean,
): string[] {
  const next = new Set(granted);
  if (enabled) next.add(capability);
  else next.delete(capability);
  return Array.from(next);
}

/** A bot-authored "Play" launch card (bot-capability-layer.md §2), carried on
 *  `Message.game` / `BotResponse.game`. */
export interface GameLaunchCard {
  entry_url: string;
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
}

/** Defensive parse for a `game` field lifted off an untyped message/WS
 *  payload -- a malformed or partial value (bot bug, hostile external bot)
 *  degrades to "no launch card" instead of a broken render. */
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
