import type { Channel } from "@wavvon/core";

export function isSpawnerChannel(channel: Pick<Channel, "channel_type">): boolean {
  return channel.channel_type === "spawner";
}

export function isTemporaryChannel(channel: Pick<Channel, "is_temporary">): boolean {
  return channel.is_temporary === true;
}

/** Resolves a temp room owner's display name for the sidebar tooltip, falling
 *  back to a short pubkey when the owner isn't in the local user list (or has
 *  no display name set) — mirrors the fallback used elsewhere for pubkeys. */
export function resolveOwnerDisplayName(
  ownerPubkey: string | null | undefined,
  users: Array<{ public_key: string; display_name: string | null }>,
): string | null {
  if (!ownerPubkey) return null;
  const user = users.find((u) => u.public_key === ownerPubkey);
  if (user?.display_name) return user.display_name;
  return ownerPubkey.slice(0, 12);
}

/** Collapses a blank "Name template" field to undefined so the create-channel
 *  payload omits it and the hub applies its own default ("{user}'s room"). */
export function normalizeSpawnerNameTemplate(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
