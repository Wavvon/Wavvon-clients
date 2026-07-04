import { sha512 } from "@noble/hashes/sha512";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes";
import { x25519, edwardsToMontgomeryPub } from "@noble/curves/ed25519";
import { hexToBytes, bytesToHex } from "../hex";

// ECIES over X25519, byte-compatible with wavvon_identity::ecies. Used to hand
// the prefs-blob key to a newly paired device: the existing device wraps for
// the new subkey's ed25519 pubkey; the new device unwraps with its seed.
//
//   wrapped = eph_x25519_pub[32] || aes_gcm_nonce[12] || ciphertext+tag[48]
//   key     = HKDF-SHA256(ikm=ecdh, salt=eph_pub, info="wavvon/ecies/v1", 32)

const ECIES_INFO = new TextEncoder().encode("wavvon/ecies/v1");

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

// ed25519 seed → x25519 scalar (SHA-512 + clamp) — the same derivation as
// dhKeypairFromSeed / Identity::dh_keypair.
function x25519PrivFromSeed(seed: Uint8Array): Uint8Array {
  const scalar = sha512(seed).slice(0, 32);
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

/** Wrap a 32-byte blob key for a recipient's ed25519 pubkey (hex). */
export function wrapBlobKey(blobKey: Uint8Array, recipientEd25519PubkeyHex: string): string {
  if (blobKey.length !== 32) throw new Error("blob key must be 32 bytes");
  const x25519Pub = edwardsToMontgomeryPub(hexToBytes(recipientEd25519PubkeyHex));

  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  const ephPub = x25519.scalarMultBase(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, x25519Pub);

  const encKey = hkdf(sha256, shared, ephPub, ECIES_INFO, 32);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = gcm(encKey, nonce).encrypt(blobKey); // 32 + 16 tag = 48

  return bytesToHex(concat(ephPub, nonce, ciphertext));
}

/** Unwrap a wrapped blob key using the recipient's ed25519 seed (hex). */
export function unwrapBlobKey(wrappedHex: string, recipientSeedHex: string): Uint8Array {
  const bytes = hexToBytes(wrappedHex);
  if (bytes.length !== 92) throw new Error(`wrapped blob key must be 92 bytes, got ${bytes.length}`);
  const ephPub = bytes.slice(0, 32);
  const nonce = bytes.slice(32, 44);
  const ct = bytes.slice(44, 92);

  const x25519Priv = x25519PrivFromSeed(hexToBytes(recipientSeedHex));
  const shared = x25519.getSharedSecret(x25519Priv, ephPub);

  const encKey = hkdf(sha256, shared, ephPub, ECIES_INFO, 32);
  return gcm(encKey, nonce).decrypt(ct);
}
