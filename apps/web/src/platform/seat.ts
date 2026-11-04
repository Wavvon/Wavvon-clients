import { hubFetchWithToken } from "./http";
import { getSession, setSession, type HubSession } from "./session";

/**
 * The pubkey a hub seated us as, asked of the hub itself. A session restored
 * from a saved token never ran `/auth/verify`, so `canonical_pubkey` is
 * filled here from `/me` the first time someone needs it.
 */
export async function seatOf(s: HubSession): Promise<string> {
  if (s.canonical_pubkey) return s.canonical_pubkey;
  const res = await hubFetchWithToken(s.hub_url, s.token, "/me");
  const me = (await res.json()) as { public_key: string };
  const current = getSession(s.hub_id);
  if (current) setSession(s.hub_id, { ...current, canonical_pubkey: me.public_key });
  return me.public_key;
}
