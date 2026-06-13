import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes, bytesToHex } from "./store";

const MASTER_INFO = new TextEncoder().encode("voxply/master/v1");

// Derive the master Ed25519 seed from the device identity entropy (32 bytes).
// HKDF-SHA256(ikm=entropy, salt=∅, info="voxply/master/v1", L=32) —
// byte-identical to MasterIdentity::derive_from_entropy() in the Rust crate.
export function deriveMasterSeedHex(identitySeedHex: string): string {
  const ikm = hexToBytes(identitySeedHex);
  const okm = hkdf(sha256, ikm, undefined, MASTER_INFO, 32);
  return bytesToHex(okm);
}

export function masterPublicKeyHex(masterSeedHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(masterSeedHex)));
}

export function signWithMasterHex(masterSeedHex: string, msg: Uint8Array): string {
  return bytesToHex(ed25519.sign(msg, hexToBytes(masterSeedHex)));
}

export function verifyEdSig(pubkeyHex: string, msg: Uint8Array, sigHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(sigHex), msg, hexToBytes(pubkeyHex));
  } catch {
    return false;
  }
}
