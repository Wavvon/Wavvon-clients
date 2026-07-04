import type { HomeHubList, RevocationEntry, SubkeyCert } from "@shared/types";
import { hubFetch, HubApiError } from "../http";

// Reads for the personal-axis identity envelopes (hub/src/routes/identity.rs).
// These are plaintext, signed records — not E2E ciphertext — so no client-side
// decryption is needed, unlike DMs and the prefs blob.

export async function getHomeHubDesignation(pubkey: string): Promise<HomeHubList | null> {
  try {
    const res = await hubFetch(`/identity/${pubkey}/designation`);
    return (await res.json()) as HomeHubList;
  } catch (e) {
    if (e instanceof HubApiError && e.status === 404) return null;
    throw e;
  }
}

export async function listDeviceCerts(pubkey: string): Promise<SubkeyCert[]> {
  const res = await hubFetch(`/identity/${pubkey}/devices`);
  return (await res.json()) as SubkeyCert[];
}

export async function listDeviceRevocations(pubkey: string): Promise<RevocationEntry[]> {
  const res = await hubFetch(`/identity/${pubkey}/revocations`);
  return (await res.json()) as RevocationEntry[];
}
