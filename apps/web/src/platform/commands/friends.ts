import { dmFetch } from "../dmHub";
import type { Friend } from "../../types";

// Friends are personal-axis state, so they live on the home hub, routed like
// DMs (dmHub.ts): the first home hub with a session, else the active hub.
// Before, every call went to the active hub, so the list a user saw depended
// on which community was on screen (clients#279). Same-hub requests use a
// pending → accepted flow. Endpoints: GET/POST /friends, GET /friends/pending,
// POST /friends/{from}/accept, DELETE /friends/{target}.

export async function listFriends(): Promise<Friend[]> {
  const r = await dmFetch("/friends");
  return r.json() as Promise<Friend[]>;
}

export async function listPendingFriendRequests(): Promise<Friend[]> {
  const r = await dmFetch("/friends/pending");
  return r.json() as Promise<Friend[]>;
}

export async function sendFriendRequest(targetPublicKey: string, hubUrl?: string): Promise<void> {
  await dmFetch("/friends", {
    method: "POST",
    body: JSON.stringify({ target_public_key: targetPublicKey, hub_url: hubUrl ?? null }),
  });
}

export async function acceptFriendRequest(fromPublicKey: string): Promise<void> {
  await dmFetch(`/friends/${fromPublicKey}/accept`, { method: "POST" });
}

export async function removeFriend(targetPublicKey: string): Promise<void> {
  await dmFetch(`/friends/${targetPublicKey}`, { method: "DELETE" });
}
