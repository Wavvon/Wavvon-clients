import type { HomeHubList, RevocationEntry, SubkeyCert } from "@shared/types";
import type { PairingOffer, PairingClaim, PairingComplete, PairingStatus } from "@wavvon/core";
import { hubFetch, rawFetch, HubApiError } from "../http";

// Reads and writes for the personal-axis identity envelopes
// (hub/src/routes/identity.rs). These are plaintext, signed records — not E2E
// ciphertext — so no client-side decryption is needed, unlike DMs and the prefs
// blob. Every write is self-authenticating: the hub verifies the envelope's
// signature, so no session token is required (pairing's new device has none).

export async function getHomeHubDesignation(pubkey: string): Promise<HomeHubList | null> {
  try {
    const res = await hubFetch(`/identity/${pubkey}/designation`);
    return (await res.json()) as HomeHubList;
  } catch (e) {
    if (e instanceof HubApiError && e.status === 404) return null;
    throw e;
  }
}

/** Publish a master-signed HomeHubList to the active hub. */
export async function putHomeHubDesignation(list: HomeHubList): Promise<void> {
  await hubFetch(`/identity/${list.master_pubkey}/designation`, {
    method: "POST",
    body: JSON.stringify(list),
  });
}

export async function listDeviceCerts(pubkey: string): Promise<SubkeyCert[]> {
  const res = await hubFetch(`/identity/${pubkey}/devices`);
  return (await res.json()) as SubkeyCert[];
}

/** Register a master-signed device cert on the active hub. */
export async function registerDeviceCert(cert: SubkeyCert): Promise<void> {
  await hubFetch(`/identity/${cert.master_pubkey}/devices`, {
    method: "POST",
    body: JSON.stringify(cert),
  });
}

export async function listDeviceRevocations(pubkey: string): Promise<RevocationEntry[]> {
  const res = await hubFetch(`/identity/${pubkey}/revocations`);
  return (await res.json()) as RevocationEntry[];
}

/** Publish a master-signed revocation of a subkey to the active hub. */
export async function postDeviceRevocation(entry: RevocationEntry): Promise<void> {
  await hubFetch(`/identity/${entry.master_pubkey}/revocations`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

// --- Pairing (hub/src/routes/pairing.rs) ---
// All four talk to an explicit hub URL and are unauthenticated: the offer and
// claim carry their own signatures, and the token gates access. The new device
// has no session yet, so these use rawFetch rather than hubFetch.

export async function postPairingOffer(hubUrl: string, offer: PairingOffer): Promise<void> {
  await rawFetch(`${hubUrl}/identity/pairing/offer`, {
    method: "POST",
    body: JSON.stringify(offer),
  });
}

export async function postPairingClaim(hubUrl: string, claim: PairingClaim): Promise<void> {
  await rawFetch(`${hubUrl}/identity/pairing/claim`, {
    method: "POST",
    body: JSON.stringify(claim),
  });
}

export async function postPairingComplete(hubUrl: string, complete: PairingComplete): Promise<void> {
  await rawFetch(`${hubUrl}/identity/pairing/complete`, {
    method: "POST",
    body: JSON.stringify(complete),
  });
}

export async function getPairingStatus(hubUrl: string, token: string): Promise<PairingStatus> {
  const res = await rawFetch(`${hubUrl}/identity/pairing/status/${token}`);
  return (await res.json()) as PairingStatus;
}
