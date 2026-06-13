import { ed25519 } from "@noble/curves/ed25519";
import { rawFetch } from "../http";
import {
  loadIdentity,
  loadPairedState,
  savePairedState,
  bytesToHex,
  hexToBytes,
} from "../../identity/store";
import type { SubkeyCert } from "../../identity/store";
import {
  deriveMasterSeedHex,
  masterPublicKeyHex,
  signWithMasterHex,
  verifyEdSig,
} from "../../identity/master";
import {
  offerSigningBytes,
  subkeyCertSigningBytes,
  claimSigningBytes,
} from "../../identity/wire";

const OFFER_LIFETIME_SECS = 240;

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function randomHex32(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export interface PairingOffer {
  master_pubkey: string;
  home_hubs: string[];
  pairing_token: string;
  issued_at: number;
  expires_at: number;
  signature: string;
}

export type PairingStatus =
  | { state: "pending" }
  | { state: "claimed"; subkey_pubkey: string; device_label: string }
  | { state: "complete"; cert: SubkeyCert; wrapped_blob_key_hex: string }
  | { state: "expired" };

export interface PairedIdentityInfo {
  master_pubkey: string;
  subkey_pubkey: string;
  device_label: string;
  home_hubs: string[];
}

export interface StartPairingResult {
  offer: PairingOffer;
  qr_payload: string;
  posted_count: number;
}

export interface ClaimResult {
  home_hub_url: string;
  master_pubkey: string;
  subkey_pubkey: string;
  subkey_secret_hex: string;
  pairing_token: string;
  home_hubs: string[];
}

export interface SyncResult {
  synced: boolean;
  error?: string;
}

export async function getPairedIdentity(): Promise<PairedIdentityInfo | null> {
  const state = await loadPairedState();
  if (!state) return null;
  const identity = await loadIdentity();
  if (!identity) return null;
  const masterSeed = deriveMasterSeedHex(identity.seed_hex);
  return {
    master_pubkey: masterPublicKeyHex(masterSeed),
    subkey_pubkey: state.cert.master_pubkey,
    device_label: state.cert.device_label,
    home_hubs: state.cert.fallback_hubs,
  };
}

export async function startPairingOffer(homeHubs: string[]): Promise<StartPairingResult> {
  if (homeHubs.length === 0) throw new Error("home_hubs must not be empty");
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity found");

  const masterSeed = deriveMasterSeedHex(identity.seed_hex);
  const masterPubkey = masterPublicKeyHex(masterSeed);
  const pairingToken = randomHex32();
  const issuedAt = nowSecs();
  const expiresAt = issuedAt + OFFER_LIFETIME_SECS;

  const bytes = offerSigningBytes(masterPubkey, homeHubs, pairingToken, issuedAt, expiresAt);
  const signature = signWithMasterHex(masterSeed, bytes);

  const offer: PairingOffer = {
    master_pubkey: masterPubkey,
    home_hubs: homeHubs,
    pairing_token: pairingToken,
    issued_at: issuedAt,
    expires_at: expiresAt,
    signature,
  };

  let postedCount = 0;
  for (const url of homeHubs) {
    try {
      const endpoint = `${url.replace(/\/$/, "")}/identity/pairing/offer`;
      await rawFetch(endpoint, { method: "POST", body: JSON.stringify(offer) });
      postedCount++;
    } catch {
      // partial failure — keep trying others
    }
  }

  if (postedCount === 0) throw new Error("No home hub accepted the pairing offer");

  return { offer, qr_payload: JSON.stringify(offer), posted_count: postedCount };
}

export async function pollPairingStatus(
  homeHubUrl: string,
  pairingToken: string,
): Promise<PairingStatus> {
  const endpoint = `${homeHubUrl.replace(/\/$/, "")}/identity/pairing/status/${pairingToken}`;
  const resp = await rawFetch(endpoint);
  return resp.json() as Promise<PairingStatus>;
}

export async function completePairing(
  homeHubUrl: string,
  pairingToken: string,
  claimSubkeyPubkey: string,
  deviceLabel: string,
  fallbackHubs: string[],
): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity found");

  const masterSeed = deriveMasterSeedHex(identity.seed_hex);
  const masterPubkey = masterPublicKeyHex(masterSeed);
  const issuedAt = nowSecs();

  const bytes = subkeyCertSigningBytes(
    masterPubkey, claimSubkeyPubkey, deviceLabel, issuedAt, null, fallbackHubs,
  );
  const signature = signWithMasterHex(masterSeed, bytes);

  const cert: SubkeyCert = {
    master_pubkey: masterPubkey,
    subkey_pubkey: claimSubkeyPubkey,
    device_label: deviceLabel,
    issued_at: issuedAt,
    not_after: null,
    fallback_hubs: fallbackHubs,
    signature,
  };

  const complete = { pairing_token: pairingToken, cert, wrapped_blob_key_hex: "" };
  const endpoint = `${homeHubUrl.replace(/\/$/, "")}/identity/pairing/complete`;
  await rawFetch(endpoint, { method: "POST", body: JSON.stringify(complete) });
}

export function fingerprintPubkey(publicKeyHex: string): string {
  const groups: string[] = [];
  for (let i = 0; i < 16 && i < publicKeyHex.length; i += 2) {
    groups.push(publicKeyHex.slice(i, i + 2));
  }
  return groups.join(":");
}

export function parsePairingOffer(qrPayload: string): PairingOffer {
  let offer: PairingOffer;
  try {
    offer = JSON.parse(qrPayload) as PairingOffer;
  } catch {
    throw new Error("Invalid pairing code — not valid JSON");
  }

  const bytes = offerSigningBytes(
    offer.master_pubkey,
    offer.home_hubs,
    offer.pairing_token,
    offer.issued_at,
    offer.expires_at,
  );
  if (!verifyEdSig(offer.master_pubkey, bytes, offer.signature)) {
    throw new Error("Pairing code has an invalid signature");
  }
  if (offer.expires_at <= nowSecs()) {
    throw new Error("Pairing code has expired");
  }
  return offer;
}

export async function claimPairingOffer(
  offer: PairingOffer,
  deviceLabel: string,
): Promise<ClaimResult> {
  const subkeySecret = ed25519.utils.randomPrivateKey();
  const subkeyPubkey = bytesToHex(ed25519.getPublicKey(subkeySecret));
  const subkeySecretHex = bytesToHex(subkeySecret);

  const bytes = claimSigningBytes(offer.pairing_token, subkeyPubkey, deviceLabel);
  const proof = bytesToHex(ed25519.sign(bytes, subkeySecret));

  const claim = {
    pairing_token: offer.pairing_token,
    subkey_pubkey: subkeyPubkey,
    device_label: deviceLabel,
    proof,
  };

  let lastError = "";
  for (const url of offer.home_hubs) {
    try {
      const endpoint = `${url.replace(/\/$/, "")}/identity/pairing/claim`;
      await rawFetch(endpoint, { method: "POST", body: JSON.stringify(claim) });
      return {
        home_hub_url: url,
        master_pubkey: offer.master_pubkey,
        subkey_pubkey: subkeyPubkey,
        subkey_secret_hex: subkeySecretHex,
        pairing_token: offer.pairing_token,
        home_hubs: offer.home_hubs,
      };
    } catch (e) {
      lastError = String(e);
    }
  }
  throw new Error(`No home hub accepted the claim. Last error: ${lastError}`);
}

export async function savePairedIdentity(params: {
  masterPubkey: string;
  subkeyPubkey: string;
  subkeySecretHex: string;
  deviceLabel: string;
  cert: SubkeyCert;
  homeHubs: string[];
  wrappedBlobKeyHex: string;
}): Promise<SyncResult> {
  const certBytes = subkeyCertSigningBytes(
    params.cert.master_pubkey,
    params.cert.subkey_pubkey,
    params.cert.device_label,
    params.cert.issued_at,
    params.cert.not_after,
    params.cert.fallback_hubs,
  );
  if (!verifyEdSig(params.cert.master_pubkey, certBytes, params.cert.signature)) {
    throw new Error("cert has an invalid master signature");
  }
  if (params.cert.master_pubkey !== params.masterPubkey) {
    throw new Error("cert master_pubkey doesn't match expected");
  }
  if (params.cert.subkey_pubkey !== params.subkeyPubkey) {
    throw new Error("cert subkey_pubkey doesn't match the one we generated");
  }

  const reconstructedPub = bytesToHex(
    ed25519.getPublicKey(hexToBytes(params.subkeySecretHex)),
  );
  if (reconstructedPub !== params.subkeyPubkey) {
    throw new Error("subkey secret doesn't round-trip to its pubkey");
  }

  await savePairedState({
    subkey_private_hex: params.subkeySecretHex,
    cert: params.cert,
  });

  return { synced: false };
}
