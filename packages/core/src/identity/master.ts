import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes, bytesToHex } from "../hex";

// The master identity is derived from the same 32 bytes that back the
// single-device identity (its ed25519 seed = BIP39 entropy = subkey 0). HKDF
// domain-separates the output so the master pubkey is distinct from subkey 0,
// while a non-upgraded hub still sees the original per-device pubkey.
//
// Byte-identical to wavvon_identity::MasterIdentity::derive_from_entropy():
//   HKDF-SHA256(salt=None, ikm=entropy, info="wavvon/master/v1", L=32)
// Pinned by the MASTER_FROM_ENTROPY_PUB vector in wire_vectors.rs.
const MASTER_HKDF_INFO = "wavvon/master/v1";

// Rust's Hkdf::new(None, ..) uses an all-zero salt of HashLen (32 bytes); for
// HMAC-SHA256 that is equivalent to an empty salt, but we pass it explicitly
// to make the parity obvious.
const MASTER_HKDF_SALT = new Uint8Array(32);

/** Derive the 32-byte master signing seed from a device seed (hex). */
export function masterSeedFromEntropy(entropyHex: string): Uint8Array {
  return hkdf(
    sha256,
    hexToBytes(entropyHex),
    MASTER_HKDF_SALT,
    new TextEncoder().encode(MASTER_HKDF_INFO),
    32,
  );
}

/** Master ed25519 public key (hex) for a device seed. */
export function masterPublicKeyHex(entropyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(masterSeedFromEntropy(entropyHex)));
}

/** Master signing seed (hex) for a device seed. */
export function masterSeedHex(entropyHex: string): string {
  return bytesToHex(masterSeedFromEntropy(entropyHex));
}
