import type { Channel } from "@wavvon/core";

export function isSpawnerChannel(channel: Pick<Channel, "channel_type">): boolean {
  return channel.channel_type === "spawner";
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
