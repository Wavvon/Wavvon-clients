import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { hexToBytes, bytesToHex } from "../hex";

// Byte-for-byte port of the length-prefixed binary encoding in
// wavvon_identity/src/wire.rs. Every signing-bytes function here is pinned by a
// canonical hex vector in wire_vectors.rs (mirrored in wire.test.ts).

function writeU32Le(v: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, v, true);
  return out;
}

function writeU64Le(v: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(v), true);
  return out;
}

// u32-LE-length-prefixed UTF-8 string — Rust's write_str().
function writeStr(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  return concat(writeU32Le(enc.length), enc);
}

// u32-LE count followed by each write_str() — Rust's write_str_vec().
function writeStrVec(v: string[]): Uint8Array {
  return concat(writeU32Le(v.length), ...v.map(writeStr));
}

function tag(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function sign(msg: Uint8Array, seedHex: string): string {
  return bytesToHex(ed25519.sign(msg, hexToBytes(seedHex)));
}

// --- Envelope types (mirror the Rust structs and the hub's JSON shapes) ---

export interface HomeHubList {
  master_pubkey: string;
  hubs: string[];
  issued_at: number;
  sequence: number;
  signature: string;
}

export interface SubkeyCert {
  master_pubkey: string;
  subkey_pubkey: string;
  device_label: string;
  issued_at: number;
  not_after: number | null;
  fallback_hubs: string[];
  signature: string;
}

export interface RevocationEntry {
  master_pubkey: string;
  subkey_pubkey: string;
  revoked_at: number;
  signature: string;
}

// The home hub stores this ciphertext but never decrypts it — see
// derivePrefsBlobKey/decryptPrefsBlob in master.ts.
export interface SignedPrefsBlob {
  master_pubkey: string;
  blob_version: number;
  ciphertext_hex: string;
  signature: string;
}

export interface PairingOffer {
  master_pubkey: string;
  home_hubs: string[];
  pairing_token: string;
  issued_at: number;
  expires_at: number;
  signature: string;
}

export interface PairingClaim {
  pairing_token: string;
  subkey_pubkey: string;
  device_label: string;
  proof: string;
}

export interface PairingComplete {
  pairing_token: string;
  cert: SubkeyCert;
  wrapped_blob_key_hex: string;
  // The canonical (subkey-0/entropy) DM DH X25519 *scalar* (not the Ed25519
  // seed), ECIES-wrapped for the claiming subkey with the same wrapBlobKey
  // primitive as wrapped_blob_key_hex — see decisions.md "Paired-device DMs
  // attribute to canonical via cert-chained envelopes; DH capability is a
  // wrapped canonical scalar". Absent for hubs/clients predating this field.
  wrapped_dh_seed_hex?: string;
}

export type PairingStatus =
  | { state: "pending" }
  | { state: "claimed"; subkey_pubkey: string; device_label: string }
  | {
      state: "complete";
      cert: SubkeyCert;
      wrapped_blob_key_hex: string;
      wrapped_dh_seed_hex?: string;
    }
  | { state: "expired" };

// --- HomeHubList ---

export function homeHubListSigningBytes(
  masterPubkey: string,
  hubs: string[],
  issuedAt: number,
  sequence: number,
): Uint8Array {
  return concat(
    tag("wavvon/home-hub-list/v1\0"),
    writeStr(masterPubkey),
    writeStrVec(hubs),
    writeU64Le(issuedAt),
    writeU64Le(sequence),
  );
}

/** Build a master-signed HomeHubList ready to PUT to a hub. */
export function buildHomeHubList(
  masterSeedHex: string,
  masterPubkey: string,
  hubs: string[],
  issuedAt: number,
  sequence: number,
): HomeHubList {
  const sig = sign(homeHubListSigningBytes(masterPubkey, hubs, issuedAt, sequence), masterSeedHex);
  return { master_pubkey: masterPubkey, hubs, issued_at: issuedAt, sequence, signature: sig };
}

// --- SubkeyCert ---

export function subkeyCertSigningBytes(
  masterPubkey: string,
  subkeyPubkey: string,
  deviceLabel: string,
  issuedAt: number,
  notAfter: number | null,
  fallbackHubs: string[],
): Uint8Array {
  const notAfterBytes =
    notAfter === null ? new Uint8Array([0]) : concat(new Uint8Array([1]), writeU64Le(notAfter));
  return concat(
    tag("wavvon/subkey-cert/v1\0"),
    writeStr(masterPubkey),
    writeStr(subkeyPubkey),
    writeStr(deviceLabel),
    writeU64Le(issuedAt),
    notAfterBytes,
    writeStrVec(fallbackHubs),
  );
}

/** Build a master-signed SubkeyCert for a device's subkey. */
export function buildSubkeyCert(
  masterSeedHex: string,
  masterPubkey: string,
  subkeyPubkey: string,
  deviceLabel: string,
  issuedAt: number,
  notAfter: number | null,
  fallbackHubs: string[],
): SubkeyCert {
  const sig = sign(
    subkeyCertSigningBytes(masterPubkey, subkeyPubkey, deviceLabel, issuedAt, notAfter, fallbackHubs),
    masterSeedHex,
  );
  return {
    master_pubkey: masterPubkey,
    subkey_pubkey: subkeyPubkey,
    device_label: deviceLabel,
    issued_at: issuedAt,
    not_after: notAfter,
    fallback_hubs: fallbackHubs,
    signature: sig,
  };
}

// --- RevocationEntry ---

export function revocationSigningBytes(
  masterPubkey: string,
  subkeyPubkey: string,
  revokedAt: number,
): Uint8Array {
  return concat(
    tag("wavvon/revocation/v1\0"),
    writeStr(masterPubkey),
    writeStr(subkeyPubkey),
    writeU64Le(revokedAt),
  );
}

/** Build a master-signed revocation for a subkey. */
export function buildRevocation(
  masterSeedHex: string,
  masterPubkey: string,
  subkeyPubkey: string,
  revokedAt: number,
): RevocationEntry {
  const sig = sign(revocationSigningBytes(masterPubkey, subkeyPubkey, revokedAt), masterSeedHex);
  return { master_pubkey: masterPubkey, subkey_pubkey: subkeyPubkey, revoked_at: revokedAt, signature: sig };
}

// --- SignedPrefsBlob ---
// Matches SignedPrefsBlob::signing_bytes() in wavvon_identity/src/wire.rs.
export function prefsBlobSigningBytes(
  masterPubkey: string,
  blobVersion: number,
  ciphertext: Uint8Array,
): Uint8Array {
  return concat(
    tag("wavvon/prefs-blob/v1\0"),
    writeStr(masterPubkey),
    writeU64Le(blobVersion),
    sha256(ciphertext),
  );
}

/** Verify a SignedPrefsBlob's master signature over its ciphertext. */
export function verifyPrefsBlob(blob: SignedPrefsBlob): boolean {
  try {
    const sb = prefsBlobSigningBytes(blob.master_pubkey, blob.blob_version, hexToBytes(blob.ciphertext_hex));
    return ed25519.verify(hexToBytes(blob.signature), sb, hexToBytes(blob.master_pubkey));
  } catch {
    return false;
  }
}

// --- PairingOffer (master-signed) ---

export function pairingOfferSigningBytes(
  masterPubkey: string,
  homeHubs: string[],
  pairingToken: string,
  issuedAt: number,
  expiresAt: number,
): Uint8Array {
  return concat(
    tag("wavvon/pairing-offer/v1\0"),
    writeStr(masterPubkey),
    writeStrVec(homeHubs),
    writeStr(pairingToken),
    writeU64Le(issuedAt),
    writeU64Le(expiresAt),
  );
}

/** Build a master-signed PairingOffer created by the existing device. */
export function buildPairingOffer(
  masterSeedHex: string,
  masterPubkey: string,
  homeHubs: string[],
  pairingToken: string,
  issuedAt: number,
  expiresAt: number,
): PairingOffer {
  const sig = sign(
    pairingOfferSigningBytes(masterPubkey, homeHubs, pairingToken, issuedAt, expiresAt),
    masterSeedHex,
  );
  return {
    master_pubkey: masterPubkey,
    home_hubs: homeHubs,
    pairing_token: pairingToken,
    issued_at: issuedAt,
    expires_at: expiresAt,
    signature: sig,
  };
}

// --- PairingClaim (signed by the NEW device's subkey, not the master) ---

export function pairingClaimSigningBytes(
  pairingToken: string,
  subkeyPubkey: string,
  deviceLabel: string,
): Uint8Array {
  return concat(
    tag("wavvon/pairing-claim/v1\0"),
    writeStr(pairingToken),
    writeStr(subkeyPubkey),
    writeStr(deviceLabel),
  );
}

/** Build a subkey-signed PairingClaim proving possession of the new subkey. */
export function buildPairingClaim(
  subkeySeedHex: string,
  pairingToken: string,
  subkeyPubkey: string,
  deviceLabel: string,
): PairingClaim {
  const proof = sign(pairingClaimSigningBytes(pairingToken, subkeyPubkey, deviceLabel), subkeySeedHex);
  return { pairing_token: pairingToken, subkey_pubkey: subkeyPubkey, device_label: deviceLabel, proof };
}
