import { sha512 } from "@noble/hashes/sha512";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { hexToBytes, bytesToHex } from "../hex";
import { subkeyCertSigningBytes, type SubkeyCert } from "./wire";

export interface DmEnvelope {
  sender_pubkey: string;
  conv_id: string;
  ciphertext_hex: string;
  nonce_hex: string;
  dh_pubkey_hex: string;
  signature_hex: string;
  // Present when this envelope was signed by a paired device's subkey
  // rather than the canonical (subkey-0/entropy) key — see
  // decisions.md "Paired-device DMs attribute to canonical via
  // cert-chained envelopes". `sender_pubkey` above stays the canonical
  // pubkey either way. Absent (and omitted from the wire) for a
  // primary/legacy device — byte-identical to today.
  signer_cert?: SubkeyCert;
}

// Ed25519 seed → X25519 scalar (SHA-512 + clamp).
// Byte-identical to wavvon_identity::Identity::dh_keypair() in Rust.
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
// Matches DhKeyRecord::signing_bytes() in wavvon-identity/src/wire.rs.
export function dhKeySigningBytes(pubkey: string, dhPubkeyHex: string): Uint8Array {
  const prefix = new TextEncoder().encode("wavvon/dh-key/v1\0");
  return concat(prefix, writeStr(pubkey), writeStr(dhPubkeyHex));
}

// Signing bytes for a 1:1 encrypted DM envelope.
// Matches dm_envelope_signing_bytes() in wavvon-identity/src/wire.rs.
export function dmEnvelopeSigningBytes(
  convId: string,
  ciphertextHex: string,
  nonceHex: string,
  dhPubkeyHex: string,
): Uint8Array {
  return concat(
    new TextEncoder().encode("wavvon/dm-ciphertext/v1\0"),
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
// encrypt_dm Tauri command in wavvon-desktop/src-tauri/src/lib.rs.
//
// `canonicalPubkey`/`signerCert` implement cert-chained attribution
// (decisions.md "Paired-device DMs attribute to canonical via cert-chained
// envelopes"): `sender_pubkey` is always the canonical identity — when
// omitted it defaults to the signing key's own pubkey (today's behavior,
// byte-identical envelope, no signer_cert). `signerCert` is only embedded
// when the signing key differs from the canonical pubkey (a paired
// device signing with its own subkey).
export function encryptDm(
  convId: string,
  plaintext: string,
  recipientDhPub: Uint8Array,
  myDhPriv: Uint8Array,
  mySigningSeed: Uint8Array,
  canonicalPubkey?: string,
  signerCert?: SubkeyCert,
): DmEnvelope {
  const shared = x25519.scalarMult(myDhPriv, recipientDhPub);
  const keyBytes = hkdf(
    sha256,
    shared,
    new TextEncoder().encode(convId),
    new TextEncoder().encode("wavvon/dm-key/v1"),
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
  const signingPubkey = publicKeyHex(seedHex);
  const senderPubkey = canonicalPubkey ?? signingPubkey;

  const sigMsg = dmEnvelopeSigningBytes(convId, ciphertextHex, nonceHex, dhPubkeyHex);

  const envelope: DmEnvelope = {
    sender_pubkey: senderPubkey,
    conv_id: convId,
    ciphertext_hex: ciphertextHex,
    nonce_hex: nonceHex,
    dh_pubkey_hex: dhPubkeyHex,
    signature_hex: signBytes(sigMsg, seedHex),
  };
  if (signerCert && signingPubkey !== senderPubkey) {
    envelope.signer_cert = signerCert;
  }
  return envelope;
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
    new TextEncoder().encode("wavvon/dm-key/v1"),
    32,
  );
  const nonce = hexToBytes(envelope.nonce_hex);
  const ct = hexToBytes(envelope.ciphertext_hex);
  const plaintextBytes = gcm(keyBytes, nonce).decrypt(ct);
  const json = JSON.parse(new TextDecoder().decode(plaintextBytes));
  return (json as { content?: string }).content ?? "";
}

// --- Double Ratchet v2 ---

function kdfRk(rk: Uint8Array, dhOutput: Uint8Array): [Uint8Array, Uint8Array] {
  const out = hkdf(sha256, dhOutput, rk, new TextEncoder().encode("wavvon/dr-rk/v2"), 64);
  return [out.slice(0, 32), out.slice(32, 64)];
}

function kdfCk(ck: Uint8Array): [Uint8Array, Uint8Array] {
  const out = hkdf(sha256, ck, new Uint8Array(0), new TextEncoder().encode("wavvon/dr-ck-step/v2"), 64);
  return [out.slice(0, 32), out.slice(32, 64)];
}

function deriveNonce(msgKey: Uint8Array): Uint8Array {
  return hkdf(sha256, msgKey, new Uint8Array(0), new TextEncoder().encode("wavvon/dr-nonce/v2"), 12);
}

export interface DRSession {
  rk: string;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  dhsPriv: string;
  dhsPub: string;
  dhr: string | null;
  mkskipped: Record<string, string>;
}

export interface DrEnvelope {
  sender_pubkey: string;
  conv_id: string;
  ciphertext_hex: string;
  /** Empty string for v2 — nonce is derived from the message key, not transmitted.
   *  Present so the hub's EncryptedDmEnvelope struct round-trips cleanly. */
  nonce_hex: string;
  dh_pubkey_hex: string;
  signature_hex: string;
  v: 2;
  message_index: number;
  prev_count: number;
  // See DmEnvelope.signer_cert — same cert-chained attribution mechanism,
  // same "omitted for a primary/legacy device" byte-identical guarantee.
  signer_cert?: SubkeyCert;
}

export function drEnvelopeSigningBytes(
  convId: string,
  messageIndex: number,
  prevCount: number,
  ciphertextHex: string,
  dhPubkeyHex: string,
): Uint8Array {
  function u32le(n: number): Uint8Array {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, n, true);
    return buf;
  }
  return concat(
    new TextEncoder().encode("wavvon/dm-ciphertext/v2\0"),
    writeStr(convId),
    u32le(messageIndex),
    u32le(prevCount),
    writeStr(ciphertextHex),
    writeStr(dhPubkeyHex),
  );
}

// `myStaticDhPrivOverride`: a paired device passes its unwrapped canonical
// DH scalar (stored at pairing time — see decisions.md "DH capability via a
// wrapped canonical scalar") instead of deriving it from `myStaticSeedHex`,
// since a paired device's own signing seed does not correspond to the
// published canonical DH key. The primary device omits it (derives from
// seed, today's behavior).
export function initDrSession(
  convId: string,
  myStaticSeedHex: string,
  theirStaticDhPubHex: string,
  myStaticDhPrivOverride?: Uint8Array,
): DRSession {
  const myStaticPriv = myStaticDhPrivOverride ?? dhKeypairFromSeed(myStaticSeedHex).dhPriv;
  const theirStaticPub = hexToBytes(theirStaticDhPubHex);

  const staticShared = x25519.scalarMult(myStaticPriv, theirStaticPub);

  const rk0 = hkdf(sha256, staticShared, new TextEncoder().encode(convId),
                   new TextEncoder().encode("wavvon/dr-init/v2"), 32);

  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  ephPriv[0] &= 248; ephPriv[31] &= 127; ephPriv[31] |= 64;
  const ephPub = x25519.scalarMultBase(ephPriv);

  const dhOut = x25519.scalarMult(ephPriv, theirStaticPub);
  const [rk, cks] = kdfRk(rk0, dhOut);

  return {
    rk: bytesToHex(rk),
    cks: bytesToHex(cks),
    ckr: null,
    ns: 0, nr: 0, pn: 0,
    dhsPriv: bytesToHex(ephPriv),
    dhsPub: bytesToHex(ephPub),
    dhr: null,
    mkskipped: {},
  };
}

// See `encryptDm` for `canonicalPubkey`/`signerCert` semantics.
export function encryptDmDr(
  convId: string,
  plaintext: string,
  session: DRSession,
  mySigningSeedHex: string,
  canonicalPubkey?: string,
  signerCert?: SubkeyCert,
): { envelope: DrEnvelope; updatedSession: DRSession } {
  if (!session.cks) throw new Error("DR session not initialised for sending");

  const ck = hexToBytes(session.cks);
  const [mk, newCks] = kdfCk(ck);
  const nonce = deriveNonce(mk);

  const plaintextBytes = new TextEncoder().encode(JSON.stringify({ content: plaintext }));
  const ciphertext = gcm(mk, nonce).encrypt(plaintextBytes);
  const ciphertextHex = bytesToHex(ciphertext);
  const dhPubkeyHex = session.dhsPub;

  const sigMsg = drEnvelopeSigningBytes(convId, session.ns, session.pn, ciphertextHex, dhPubkeyHex);
  const signingPubkey = publicKeyHex(mySigningSeedHex);
  const senderPubkey = canonicalPubkey ?? signingPubkey;
  const signatureHex = signBytes(sigMsg, mySigningSeedHex);

  const envelope: DrEnvelope = {
    sender_pubkey: senderPubkey,
    conv_id: convId,
    ciphertext_hex: ciphertextHex,
    nonce_hex: "",
    dh_pubkey_hex: dhPubkeyHex,
    signature_hex: signatureHex,
    v: 2,
    message_index: session.ns,
    prev_count: session.pn,
  };
  if (signerCert && signingPubkey !== senderPubkey) {
    envelope.signer_cert = signerCert;
  }

  const updatedSession: DRSession = {
    ...session,
    cks: bytesToHex(newCks),
    ns: session.ns + 1,
  };

  return { envelope, updatedSession };
}

// `myStaticDhPrivOverride`: see `initDrSession` — a paired device passes its
// unwrapped canonical DH scalar instead of deriving it from its own
// (non-canonical) signing seed.
export function decryptDmDr(
  envelope: DrEnvelope,
  session: DRSession,
  myStaticSeedHex: string,
  theirStaticDhPubHex: string,
  myStaticDhPrivOverride?: Uint8Array,
): { plaintext: string; updatedSession: DRSession } {
  const state = { ...session, mkskipped: { ...session.mkskipped } };
  const { dh_pubkey_hex: incomingDhr, message_index: n, prev_count: pn } = envelope;

  const skippedKey = `${incomingDhr}:${n}`;
  if (state.mkskipped[skippedKey]) {
    const mk = hexToBytes(state.mkskipped[skippedKey]);
    delete state.mkskipped[skippedKey];
    const nonce = deriveNonce(mk);
    const pt = gcm(mk, nonce).decrypt(hexToBytes(envelope.ciphertext_hex));
    const json = JSON.parse(new TextDecoder().decode(pt));
    return { plaintext: (json as { content?: string }).content ?? "", updatedSession: state };
  }

  if (!state.ckr) {
    const myStaticPriv = myStaticDhPrivOverride ?? dhKeypairFromSeed(myStaticSeedHex).dhPriv;
    const theirStaticPub = hexToBytes(theirStaticDhPubHex);
    const staticShared = x25519.scalarMult(myStaticPriv, theirStaticPub);
    const rk0 = hkdf(sha256, staticShared, new TextEncoder().encode(envelope.conv_id),
                     new TextEncoder().encode("wavvon/dr-init/v2"), 32);
    const [newRk, ckr0] = kdfRk(rk0, x25519.scalarMult(myStaticPriv, hexToBytes(incomingDhr)));
    state.rk = bytesToHex(newRk);
    state.ckr = bytesToHex(ckr0);
    state.nr = 0;
    state.dhr = incomingDhr;
    const newEphPriv = crypto.getRandomValues(new Uint8Array(32));
    newEphPriv[0] &= 248; newEphPriv[31] &= 127; newEphPriv[31] |= 64;
    const newEphPub = x25519.scalarMultBase(newEphPriv);
    const [rk2, cks0] = kdfRk(hexToBytes(state.rk), x25519.scalarMult(newEphPriv, hexToBytes(incomingDhr)));
    state.rk = bytesToHex(rk2);
    state.cks = bytesToHex(cks0);
    state.dhsPriv = bytesToHex(newEphPriv);
    state.dhsPub = bytesToHex(newEphPub);
  }

  if (incomingDhr !== state.dhr) {
    skipMessageKeys(state, pn);
    state.pn = state.ns;
    state.ns = 0;
    state.nr = 0;
    state.dhr = incomingDhr;
    const dhPriv = hexToBytes(state.dhsPriv);
    const theirNewPub = hexToBytes(incomingDhr);
    const [rk1, newCkr] = kdfRk(hexToBytes(state.rk), x25519.scalarMult(dhPriv, theirNewPub));
    state.rk = bytesToHex(rk1);
    state.ckr = bytesToHex(newCkr);
    const newPriv = crypto.getRandomValues(new Uint8Array(32));
    newPriv[0] &= 248; newPriv[31] &= 127; newPriv[31] |= 64;
    const newPub = x25519.scalarMultBase(newPriv);
    const [rk2, newCks] = kdfRk(hexToBytes(state.rk), x25519.scalarMult(newPriv, theirNewPub));
    state.rk = bytesToHex(rk2);
    state.cks = bytesToHex(newCks);
    state.dhsPriv = bytesToHex(newPriv);
    state.dhsPub = bytesToHex(newPub);
  }

  skipMessageKeys(state, n);

  const ckrBytes = hexToBytes(state.ckr!);
  const [mk, newCkr] = kdfCk(ckrBytes);
  state.ckr = bytesToHex(newCkr);
  state.nr += 1;

  const nonce = deriveNonce(mk);
  const pt = gcm(mk, nonce).decrypt(hexToBytes(envelope.ciphertext_hex));
  const json = JSON.parse(new TextDecoder().decode(pt));
  return { plaintext: (json as { content?: string }).content ?? "", updatedSession: state };
}

function skipMessageKeys(state: DRSession, until: number): void {
  const MAX_SKIP = 1000;
  let count = Object.keys(state.mkskipped).length;
  while (state.nr < until) {
    if (count >= MAX_SKIP) throw new Error("too_many_skipped_messages");
    const [mk, newCkr] = kdfCk(hexToBytes(state.ckr!));
    state.mkskipped[`${state.dhr}:${state.nr}`] = bytesToHex(mk);
    state.ckr = bytesToHex(newCkr);
    state.nr += 1;
    count++;
  }
}

// --- Cert-chained receive-side verification (decisions.md "Paired-device
// DMs attribute to canonical via cert-chained envelopes") ---

/** Verify a SubkeyCert's master→subkey signature. */
export function verifySubkeyCert(cert: SubkeyCert): boolean {
  try {
    const sb = subkeyCertSigningBytes(
      cert.master_pubkey,
      cert.subkey_pubkey,
      cert.device_label,
      cert.issued_at,
      cert.not_after,
      cert.fallback_hubs,
    );
    return ed25519.verify(hexToBytes(cert.signature), sb, hexToBytes(cert.master_pubkey));
  } catch {
    return false;
  }
}

/**
 * Verify a 1:1 encrypted DM envelope's signature, tiered by whether a
 * `signer_cert` is attached — mirrors the hub's `verify_envelope_sender`.
 *
 * - No `signer_cert`: verifies `signature_hex` against `sender_pubkey`
 *   directly (today's behavior).
 * - `signer_cert` present: verifies the cert (master→subkey) and the
 *   envelope signature against `cert.subkey_pubkey`.
 *
 * Does NOT itself bind `sender_pubkey` to `signer_cert.master_pubkey` —
 * the client has no session/device-registry resolver, so the caller binds
 * `sender_pubkey` to whatever it already trusts (e.g. the conversation's
 * other canonical member) before treating the message as authenticated.
 */
export function verifyDmEnvelopeSigner(env: DmEnvelope | DrEnvelope): boolean {
  try {
    const sigMsg =
      "v" in env && env.v === 2
        ? drEnvelopeSigningBytes(
            env.conv_id,
            env.message_index,
            env.prev_count,
            env.ciphertext_hex,
            env.dh_pubkey_hex,
          )
        : dmEnvelopeSigningBytes(env.conv_id, env.ciphertext_hex, env.nonce_hex, env.dh_pubkey_hex);
    const sigBytes = hexToBytes(env.signature_hex);

    if (!env.signer_cert) {
      return ed25519.verify(sigBytes, sigMsg, hexToBytes(env.sender_pubkey));
    }
    if (!verifySubkeyCert(env.signer_cert)) return false;
    return ed25519.verify(sigBytes, sigMsg, hexToBytes(env.signer_cert.subkey_pubkey));
  } catch {
    return false;
  }
}
