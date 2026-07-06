import { hubFetch } from "../http";
import type {
  RecoveryContactsResponse,
  RecoveryPendingRequest,
} from "../../types";

// ---- Recovery contacts ----

export async function getRecoveryContacts(): Promise<RecoveryContactsResponse> {
  const r = await hubFetch("/recovery/contacts");
  return r.json() as Promise<RecoveryContactsResponse>;
}

export async function setRecoveryContacts(
  threshold: number,
  contactPubkeys: string[],
): Promise<void> {
  await hubFetch("/recovery/contacts", {
    method: "PUT",
    body: JSON.stringify({ threshold, contacts: contactPubkeys }),
  });
}

export async function removeRecoveryContact(pubkey: string): Promise<void> {
  await hubFetch(`/recovery/contacts/${encodeURIComponent(pubkey)}`, {
    method: "DELETE",
  });
}

export async function listAdminRecoveryRequests(): Promise<RecoveryPendingRequest[]> {
  const r = await hubFetch("/admin/recovery/pending");
  return r.json() as Promise<RecoveryPendingRequest[]>;
}

export async function approveRecoveryRequest(requestId: string): Promise<void> {
  await hubFetch(`/admin/recovery/${requestId}/approve`, { method: "POST" });
}

export async function denyRecoveryRequest(requestId: string): Promise<void> {
  await hubFetch(`/admin/recovery/${requestId}/deny`, { method: "POST" });
}

// ---- DM blocks ----

export async function updateDmBlocks(blockedPubkeys: string[]): Promise<void> {
  await hubFetch("/identity/dm-blocks", {
    method: "PUT",
    body: JSON.stringify({ blocked_pubkeys: blockedPubkeys }),
  });
}
