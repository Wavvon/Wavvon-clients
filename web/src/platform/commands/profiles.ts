import { hubFetch } from "../http";
import type { UserProfile } from "@shared/types";

export async function getUserProfile(pubkey: string): Promise<UserProfile> {
  const res = await hubFetch(`/users/${pubkey}/profile`);
  return res.json() as Promise<UserProfile>;
}
