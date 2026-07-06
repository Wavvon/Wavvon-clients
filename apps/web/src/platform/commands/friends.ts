import { hubFetch } from "../http";
import type { Friend } from "../../types";

// Friends live on the hub (same-hub requests use a pending → accepted flow).
// Endpoints: GET/POST /friends, GET /friends/pending,
// POST /friends/{from}/accept, DELETE /friends/{target}.

export async function listFriends(): Promise<Friend[]> {
  const r = await hubFetch("/friends");
  return r.json() as Promise<Friend[]>;
}

export async function listPendingFriendRequests(): Promise<Friend[]> {
  const r = await hubFetch("/friends/pending");
  return r.json() as Promise<Friend[]>;
}

export async function sendFriendRequest(targetPublicKey: string): Promise<void> {
  await hubFetch("/friends", {
    method: "POST",
    body: JSON.stringify({ target_public_key: targetPublicKey }),
  });
}

export async function acceptFriendRequest(fromPublicKey: string): Promise<void> {
  await hubFetch(`/friends/${fromPublicKey}/accept`, { method: "POST" });
}

export async function removeFriend(targetPublicKey: string): Promise<void> {
  await hubFetch(`/friends/${targetPublicKey}`, { method: "DELETE" });
}
