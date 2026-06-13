import { sha512 } from "@noble/hashes/sha512";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { hexToBytes, bytesToHex } from "./store";

export interface DmEnvelope {
  sender_pubkey: string;
  conv_id: string;
  ciphertext_hex: string;
  nonce_hex: string;
  dh_pubkey_hex: string;
  signature_hex: string;
}

// Ed25519 seed → X25519 scalar (SHA-512 + clamp).
// Byte-identical to voxply_identity::Identity::dh_keypair() in Rust.
export function dhKeypairFromSeed(seedHex: string): {
  dhPriv: Uint8Array;
  dhPub: Uint8Array;
} {
  const seed = hexToBytes(seedHex);
  const hash = sha512(seed);
  const scalar = hash.slice(0, 32);
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  const dhPub = x25519.scalarMultBase(scalar);
  return { dhPriv: scalar, dhPub };
}

// u32-LE-length-prefixed UTF-8 string — matches Rust's write_str() in wire.rs
function writeStr(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + enc.length);
  new DataView(out.buffer).setUint32(0, enc.length, true);
  out.set(enc, 4);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// Signing bytes for DH key publication.
// Matches DhKeyRecord::signing_bytes() in voxply-identity/src/wire.rs.
export function dhKeySigningBytes(pubkey: string, dhPubkeyHex: string): Uint8Array {
  const prefix = new TextEncoder().encode("voxply/dh-key/v1\0");
  return concat(prefix, writeStr(pubkey), writeStr(dhPubkeyHex));
}

// Signing bytes for a 1:1 encrypted DM envelope.
// Matches dm_envelope_signing_bytes() in voxply-identity/src/wire.rs.
export function dmEnvelopeSigningBytes(
  convId: string,
  ciphertextHex: string,
  nonceHex: string,
  dhPubkeyHex: string,
): Uint8Array {
  return concat(
    new TextEncoder().encode("voxply/dm-ciphertext/v1\0"),
    writeStr(convId),
    writeStr(ciphertextHex),
    writeStr(nonceHex),
    writeStr(dhPubkeyHex),
  );
}

// Ed25519 sign — synchronous via @noble/curves.
export function signBytes(msg: Uint8Array, seedHex: string): string {
  const sig = ed25519.sign(msg, hexToBytes(seedHex));
  return bytesToHex(sig);
}

// Derive Ed25519 public key from seed hex.
export function publicKeyHex(seedHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(seedHex)));
}

// Encrypt a DM. Produces a signed envelope byte-identical to the Rust
// encrypt_dm Tauri command in voxply-desktop/src-tauri/src/lib.rs.
export function encryptDm(
  convId: string,
  plaintext: string,
  recipientDhPub: Uint8Array,
  myDhPriv: Uint8Array,
  mySigningSeed: Uint8Array,
): DmEnvelope {
  const shared = x25519.scalarMult(myDhPriv, recipientDhPub);
  const keyBytes = hkdf(
    sha256,
    shared,
    new TextEncoder().encode(convId),
    new TextEncoder().encode("voxply/dm-key/v1"),
    32,
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(
    JSON.stringify({ content: plaintext }),
  );
  const ciphertext = gcm(keyBytes, nonce).encrypt(plaintextBytes);

  const ciphertextHex = bytesToHex(ciphertext);
  const nonceHex = bytesToHex(nonce);
  const myDhPub = x25519.scalarMultBase(myDhPriv);
  const dhPubkeyHex = bytesToHex(myDhPub);
  const seedHex = bytesToHex(mySigningSeed);
  const senderPubkey = publicKeyHex(seedHex);

  const sigMsg = dmEnvelopeSigningBytes(convId, ciphertextHex, nonceHex, dhPubkeyHex);

  return {
    sender_pubkey: senderPubkey,
    conv_id: convId,
    ciphertext_hex: ciphertextHex,
    nonce_hex: nonceHex,
    dh_pubkey_hex: dhPubkeyHex,
    signature_hex: signBytes(sigMsg, seedHex),
  };
}

// Decrypt a DM envelope. Symmetric to encryptDm.
export function decryptDm(
  convId: string,
  envelope: DmEnvelope,
  myDhPriv: Uint8Array,
): string {
  const senderDhPub = hexToBytes(envelope.dh_pubkey_hex);
  const shared = x25519.scalarMult(myDhPriv, senderDhPub);
  const keyBytes = hkdf(
    sha256,
    shared,
    new TextEncoder().encode(convId),
    new TextEncoder().encode("voxply/dm-key/v1"),
    32,
  );
  const nonce = hexToBytes(envelope.nonce_hex);
  const ct = hexToBytes(envelope.ciphertext_hex);
  const plaintextBytes = gcm(keyBytes, nonce).decrypt(ct);
  const json = JSON.parse(new TextDecoder().decode(plaintextBytes));
  return (json as { content?: string }).content ?? "";
}
