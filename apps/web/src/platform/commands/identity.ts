import type { HomeHubList, RevocationEntry, SignedPrefsBlob, SubkeyCert } from "@shared/types";
import type { PairingOffer, PairingClaim, PairingComplete, PairingStatus } from "@wavvon/core";
import { buildHomeHubList, buildSubkeyCert, masterSeedHex, masterPublicKeyHex, publicKeyHex } from "@wavvon/core";
import i18n from "@wavvon/i18n";
import { saveIdentity, holdsMasterSeed, type IdentityRecord } from "@identity/index";
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

/** The first hub an account signs in to becomes its home hub. Personal-axis
 *  state (the prefs blob, the DM inbox) needs a published list to live in, and
 *  a list only ever created by hand in Settings stays empty for almost
 *  everyone — which leaves the hub list unsynced and a wiped browser with
 *  nothing to restore from. No-op once a designation exists, including a
 *  deliberately emptied one, so this never overrides the user's own choice.
 *  A paired device is skipped: a subkey cannot sign a HomeHubList. */
export async function ensureHomeHubDesignation(
  identity: { seed_hex: string; master_pubkey?: string; subkey_cert?: SubkeyCert },
  hubUrl: string,
): Promise<void> {
  if (!holdsMasterSeed(identity)) return;
  const pubkey = masterPublicKeyHex(identity.seed_hex);
  if (await getHomeHubDesignation(pubkey)) return;
  const list = buildHomeHubList(
    masterSeedHex(identity.seed_hex),
    pubkey,
    [hubUrl.replace(/\/+$/, "")],
    Math.floor(Date.now() / 1000),
    1,
  );
  await putHomeHubDesignation(list);
}

/** Every identity gets a device cert the first time it authenticates, not the
 *  first time its owner opens Settings.
 *
 *  The cert is the only thing that links a roster pubkey to the master pubkey a
 *  home hub list is signed by and stored under. Issuing it from the device
 *  naming flow made that link conditional on a cosmetic action almost nobody
 *  performs, so a plain single-device identity had no link on any hub: no hub
 *  could find its designation, DM mirroring skipped it, and a sender's hub
 *  declined to fan out — with no error anywhere. Registering at first auth is
 *  what Matrix does with a device at login; naming stays cosmetic and re-issues
 *  the cert (DevicesSection).
 *
 *  No-op once a cert exists, which also covers a paired device: its cert was
 *  issued by the pairing device, and it holds no master seed to sign one. */
export async function ensureSelfDeviceCert(identity: IdentityRecord, hubUrl: string): Promise<void> {
  if (identity.subkey_cert) return;
  const masterPubkey = masterPublicKeyHex(identity.seed_hex);
  const cert = buildSubkeyCert(
    masterSeedHex(identity.seed_hex),
    masterPubkey,
    publicKeyHex(identity.seed_hex),
    identity.device_label?.trim() || i18n.t("settings.account.devices.default_label"),
    Math.floor(Date.now() / 1000),
    null,
    [hubUrl.replace(/\/+$/, "")],
  );
  // Persist before registering: a hub that rejects the cert must not leave this
  // device without one, since auth presents it from here on.
  await saveIdentity({
    ...identity,
    master_pubkey: masterPubkey,
    device_label: cert.device_label,
    subkey_cert: cert,
  });
  await registerDeviceCert(cert);
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

/** Fetch the master's E2E-encrypted prefs blob — the hub holds ciphertext only. */
export async function getPrefsBlob(masterPubkey: string): Promise<SignedPrefsBlob | null> {
  try {
    const res = await hubFetch(`/identity/${masterPubkey}/prefs`);
    return (await res.json()) as SignedPrefsBlob;
  } catch (e) {
    if (e instanceof HubApiError && e.status === 404) return null;
    throw e;
  }
}

/** Same read against an explicit hub URL. The prefs endpoints are
 *  unauthenticated — the envelope carries its own master signature — so this
 *  reaches a home hub the user is not currently connected to. `hubUrl` must
 *  carry no trailing slash. */
export async function getPrefsBlobFrom(hubUrl: string, masterPubkey: string): Promise<SignedPrefsBlob | null> {
  try {
    const res = await rawFetch(`${hubUrl}/identity/${masterPubkey}/prefs`);
    return (await res.json()) as SignedPrefsBlob;
  } catch {
    // 404 (nothing published yet) and an unreachable hub are the same thing
    // to the caller: this hub has no blob to offer.
    return null;
  }
}

/** Publish the master-signed prefs blob to one hub. The hub rejects a
 *  non-increasing blob_version with 409 — the caller re-reads and retries. */
export async function putPrefsBlobTo(hubUrl: string, blob: SignedPrefsBlob): Promise<void> {
  await rawFetch(`${hubUrl}/identity/${blob.master_pubkey}/prefs`, {
    method: "PUT",
    body: JSON.stringify(blob),
  });
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
