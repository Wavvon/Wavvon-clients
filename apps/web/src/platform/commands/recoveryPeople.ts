import { hubFetch } from "../http";
import { activeHubSupports } from "../session";
import { fetchAllUsers } from "./users";
import { listFriends } from "./friends";
import type { RecoveryPerson, RecoveryRequestToAttest } from "@wavvon/ui";

/** This hub's members plus the account's friends, once each: who can be a
 *  recovery contact, and among whom the lost account is found by name. */
export async function listRecoveryPeople(): Promise<RecoveryPerson[]> {
  const [members, friends] = await Promise.all([fetchAllUsers(), listFriends().catch(() => [])]);
  const byKey = new Map<string, RecoveryPerson>();
  for (const u of members) byKey.set(u.public_key, { pubkey: u.public_key, display_name: u.display_name, avatar: u.avatar });
  for (const f of friends) {
    if (!byKey.has(f.public_key)) byKey.set(f.public_key, { pubkey: f.public_key, display_name: f.display_name });
  }
  return [...byKey.values()];
}

/** `null` when the hub cannot list them, so the caller keeps the id field. */
export async function listRecoveryRequestsToAttest(): Promise<RecoveryRequestToAttest[] | null> {
  if (!activeHubSupports("recovery.to_attest")) return null;
  return (await hubFetch("/recovery/requests/to-attest")).json() as Promise<RecoveryRequestToAttest[]>;
}
