import type { User } from "../types";

/** What a DM shows for a peer: their name on this hub, else a name learned
 *  where the conversation was started (a person found on an allied hub is not
 *  a member here), else a key prefix. */
export function dmPeerLabel(key: string, users: User[], peerNames?: Record<string, string>): string {
  return users.find((u) => u.public_key === key)?.display_name || peerNames?.[key] || key.slice(0, 12);
}
