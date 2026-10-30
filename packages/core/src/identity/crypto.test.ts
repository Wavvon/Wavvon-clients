// Wire-format vectors from wire-vectors/wire-vectors.json (the server's
// vectors, vendored byte-for-byte). These pin the hand-written encoders in
// crypto.ts to the exact bytes the hub produces, so the formats cannot drift.
import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "../hex";
import {
  dhKeypairFromSeed,
  dhKeySigningBytes,
  dmEnvelopeSigningBytes,
  drEnvelopeSigningBytes,
  publicKeyHex,
  encryptDm,
  encryptDmDr,
  decryptDmDr,
  initDrSession,
  verifyDmEnvelopeSigner,
  verifySubkeyCert,
} from "./crypto";
import { buildSubkeyCert, type SubkeyCert } from "./wire";
import { fixture, vector } from "./wireVectors";

const masterSeed = hexToBytes(fixture("master_seed"));
const MASTER_PUB = fixture("master_pub");

describe("fixed key vectors", () => {
  it("derives the master public key", () => {
    const v = vector("master_pubkey");
    expect(publicKeyHex(v.str("seed"))).toBe(v.out("public_key"));
  });
});

describe("dhKeypairFromSeed (ed25519 → x25519 derivation)", () => {
  it("derives the canonical master DH public key", () => {
    const v = vector("master_dh_pubkey");
    const { dhPub } = dhKeypairFromSeed(v.str("seed"));
    expect(bytesToHex(dhPub)).toBe(v.out("dh_pubkey"));
  });
});

describe("dhKeySigningBytes (DhKeyRecord)", () => {
  const v = vector("dh_key_record");
  const sb = () => dhKeySigningBytes(v.str("pubkey"), v.str("dh_pubkey"));

  it("reproduces the canonical signing bytes", () => {
    expect(bytesToHex(sb())).toBe(v.out("signing_bytes"));
  });

  it("reproduces the canonical master signature", () => {
    expect(bytesToHex(ed25519.sign(sb(), v.str("signer_seed")))).toBe(v.out("signature"));
  });
});

describe("drEnvelopeSigningBytes (dm-ciphertext/v2) wire vector", () => {
  const v = vector("dr_envelope");
  const sb = () =>
    drEnvelopeSigningBytes(
      v.str("conversation_id"),
      v.num("message_index"),
      v.num("prev_count"),
      v.str("ciphertext"),
      v.str("dh_pubkey"),
    );

  it("reproduces the canonical signing bytes", () => {
    expect(bytesToHex(sb())).toBe(v.out("signing_bytes"));
  });

  it("reproduces the canonical master signature", () => {
    expect(bytesToHex(ed25519.sign(sb(), v.str("signer_seed")))).toBe(v.out("signature"));
  });
});

describe("dmEnvelopeSigningBytes (EncryptedDmEnvelope)", () => {
  const v = vector("dm_envelope");
  const sb = () =>
    dmEnvelopeSigningBytes(v.str("conversation_id"), v.str("ciphertext"), v.str("nonce"), v.str("sender_dh_pubkey"));

  it("reproduces the canonical signing bytes", () => {
    expect(bytesToHex(sb())).toBe(v.out("signing_bytes"));
  });

  it("reproduces the canonical master signature", () => {
    expect(bytesToHex(ed25519.sign(sb(), v.str("signer_seed")))).toBe(v.out("signature"));
  });
});

// ---------------------------------------------------------------------------
// Cert-chained DM attribution (decisions.md "Paired-device DMs attribute to
// canonical via cert-chained envelopes; DH capability is a wrapped canonical
// scalar"). masterSeed above stands in for the canonical (subkey-0/entropy)
// identity; subkeySeed stands in for a paired device's own (non-canonical)
// signing key.
// ---------------------------------------------------------------------------

const subkeySeed = new Uint8Array(32).fill(7);
const subkeySeedHex = bytesToHex(subkeySeed);
const subkeyPubHex = publicKeyHex(subkeySeedHex);
const masterSeedHex = bytesToHex(masterSeed);

function buildTestCert(): SubkeyCert {
  return buildSubkeyCert(masterSeedHex, MASTER_PUB, subkeyPubHex, "phone", 1_700_000_000, null, []);
}

describe("encryptDm cert-chained attribution", () => {
  const recipientSeedHex = bytesToHex(new Uint8Array(32).fill(9));
  const { dhPub: recipientDhPub } = dhKeypairFromSeed(recipientSeedHex);
  const { dhPriv: canonicalDhPriv } = dhKeypairFromSeed(masterSeedHex);

  it("omits sender/cert args entirely — byte-shape identical to the legacy call", () => {
    const env = encryptDm("conv1", "hi", recipientDhPub, canonicalDhPriv, masterSeed);
    expect(env.sender_pubkey).toBe(MASTER_PUB);
    expect(env.signer_cert).toBeUndefined();
  });

  it("does not attach signer_cert when the signing key already IS canonical", () => {
    const cert = buildTestCert();
    const env = encryptDm("conv1", "hi", recipientDhPub, canonicalDhPriv, masterSeed, MASTER_PUB, cert);
    expect(env.sender_pubkey).toBe(MASTER_PUB);
    expect(env.signer_cert).toBeUndefined();
  });

  it("attaches signer_cert when a paired device signs with its own subkey", () => {
    const cert = buildTestCert();
    const env = encryptDm("conv1", "hi", recipientDhPub, canonicalDhPriv, subkeySeed, MASTER_PUB, cert);
    expect(env.sender_pubkey).toBe(MASTER_PUB);
    expect(env.signer_cert).toEqual(cert);
    expect(verifyDmEnvelopeSigner(env)).toBe(true);
  });
});

describe("verifySubkeyCert / verifyDmEnvelopeSigner", () => {
  it("verifies a validly-signed cert", () => {
    expect(verifySubkeyCert(buildTestCert())).toBe(true);
  });

  it("rejects a cert with a tampered field (signature no longer matches)", () => {
    const cert = buildTestCert();
    expect(verifySubkeyCert({ ...cert, device_label: "tampered" })).toBe(false);
  });

  it("rejects an envelope whose cert doesn't verify", () => {
    const recipientSeedHex = bytesToHex(new Uint8Array(32).fill(9));
    const { dhPub: recipientDhPub } = dhKeypairFromSeed(recipientSeedHex);
    const { dhPriv: canonicalDhPriv } = dhKeypairFromSeed(masterSeedHex);
    const cert = buildTestCert();
    const env = encryptDm("conv1", "hi", recipientDhPub, canonicalDhPriv, subkeySeed, MASTER_PUB, cert);
    const tampered = { ...env, signer_cert: { ...cert, device_label: "tampered" } };
    expect(verifyDmEnvelopeSigner(tampered)).toBe(false);
  });

  it("accepts a legacy (no-cert) envelope, verifying against sender_pubkey directly", () => {
    const recipientSeedHex = bytesToHex(new Uint8Array(32).fill(9));
    const { dhPub: recipientDhPub } = dhKeypairFromSeed(recipientSeedHex);
    const { dhPriv: canonicalDhPriv } = dhKeypairFromSeed(masterSeedHex);
    const env = encryptDm("conv1", "hi", recipientDhPub, canonicalDhPriv, masterSeed);
    expect(verifyDmEnvelopeSigner(env)).toBe(true);
  });
});

describe("paired-device DR round trip via the wrapped canonical DH scalar", () => {
  it("a message signed by a subkey (cert attached) decrypts using the canonical DH keypair", () => {
    const bobSeedHex = bytesToHex(new Uint8Array(32).fill(3));
    const { dhPub: bobDhPub } = dhKeypairFromSeed(bobSeedHex);
    const { dhPriv: aliceCanonicalDhPriv, dhPub: aliceCanonicalDhPub } = dhKeypairFromSeed(masterSeedHex);

    // Alice's phone (subkeySeed) initiates the DR session with the
    // *unwrapped canonical* scalar override — exactly what a paired device
    // does after pairing hands it wrapped_dh_seed_hex.
    const session = initDrSession("conv1", subkeySeedHex, bytesToHex(bobDhPub), aliceCanonicalDhPriv);
    const cert = buildTestCert();
    const { envelope } = encryptDmDr("conv1", "hello bob", session, subkeySeedHex, MASTER_PUB, cert);

    expect(envelope.sender_pubkey).toBe(MASTER_PUB);
    expect(envelope.signer_cert).toEqual(cert);
    expect(verifyDmEnvelopeSigner(envelope)).toBe(true);

    // Bob decrypts against Alice's canonical DH pubkey (what's actually
    // published at /identity/{canonical}/dh-key) — succeeds because both
    // sides key off the same canonical scalar regardless of which device
    // signed.
    const bobSession = {
      rk: "", cks: null, ckr: null,
      ns: 0, nr: 0, pn: 0,
      dhsPriv: "", dhsPub: "", dhr: null,
      mkskipped: {},
    };
    const { plaintext } = decryptDmDr(envelope, bobSession, bobSeedHex, bytesToHex(aliceCanonicalDhPub));
    expect(plaintext).toBe("hello bob");
  });
});

describe("DR two-way conversation", () => {
  // Regression (2026-07-26): decryptDmDr gated its responder-init on
  // ckr == null, but an INITIATOR's session also has ckr == null until the
  // first reply arrives — the reply was hijacked into a bogus re-init and
  // never decrypted. The init must run only for a truly empty session.
  it("the initiator decrypts the responder's first reply, then both continue", () => {
    const aliceSeed = bytesToHex(new Uint8Array(32).fill(7));
    const bobSeed = bytesToHex(new Uint8Array(32).fill(8));
    const { dhPub: aliceDhPub } = dhKeypairFromSeed(aliceSeed);
    const { dhPub: bobDhPub } = dhKeypairFromSeed(bobSeed);
    const emptySession = () => ({
      rk: "", cks: null, ckr: null,
      ns: 0, nr: 0, pn: 0,
      dhsPriv: "", dhsPub: "", dhr: null,
      mkskipped: {},
    });

    // Alice initiates and sends the first message.
    let alice = initDrSession("conv2", aliceSeed, bytesToHex(bobDhPub));
    const m1 = encryptDmDr("conv2", "hello bob", alice, aliceSeed);
    alice = m1.updatedSession;

    // Bob (empty session) decrypts it — responder init.
    let bob = emptySession();
    const d1 = decryptDmDr(m1.envelope, bob, bobSeed, bytesToHex(aliceDhPub));
    bob = d1.updatedSession;
    expect(d1.plaintext).toBe("hello bob");

    // Bob replies; ALICE decrypts — the case that was broken.
    const m2 = encryptDmDr("conv2", "hi alice", bob, bobSeed);
    bob = m2.updatedSession;
    const d2 = decryptDmDr(m2.envelope, alice, aliceSeed, bytesToHex(bobDhPub));
    alice = d2.updatedSession;
    expect(d2.plaintext).toBe("hi alice");

    // And the ratchet keeps turning in both directions.
    const m3 = encryptDmDr("conv2", "how are you?", alice, aliceSeed);
    alice = m3.updatedSession;
    const d3 = decryptDmDr(m3.envelope, bob, bobSeed, bytesToHex(aliceDhPub));
    bob = d3.updatedSession;
    expect(d3.plaintext).toBe("how are you?");

    const m4 = encryptDmDr("conv2", "great!", bob, bobSeed);
    const d4 = decryptDmDr(m4.envelope, alice, aliceSeed, bytesToHex(bobDhPub));
    expect(d4.plaintext).toBe("great!");
  });

  // Reverse cross-language vector: a real envelope produced by the desktop
  // Rust initiator (apps/desktop/src-tauri/src/dm.rs initiator_init_session
  // + the encrypt_dm_dr chain, seeds 0x07/0x08, conv "conv-rvector") must
  // decrypt via the TS responder init — the exact desktop→web DM path.
  // The Rust suite pins the opposite direction (decrypts_ts_initiator_envelope).
  it("the TS responder decrypts a Rust-initiator envelope", () => {
    const bobSeed = "08".repeat(32);
    const bob = {
      rk: "", cks: null, ckr: null,
      ns: 0, nr: 0, pn: 0,
      dhsPriv: "", dhsPub: "", dhr: null,
      mkskipped: {},
    };
    const envelope = {
      sender_pubkey: "", // signature is verified separately, not in decryptDmDr
      conv_id: "conv-rvector",
      ciphertext_hex: "466f21a4b3e2f2e6f968583ed6ced3deb2177a816ee3200eedaec138ffd13604d2696fe1f7d87662e55c5c3dd2e042",
      nonce_hex: "",
      dh_pubkey_hex: "a63af13d1025ab617aca92c355abd75dccbf221ff602f01070a7c7ac765b7074",
      signature_hex: "",
      v: 2 as const,
      message_index: 0,
      prev_count: 0,
    };
    const aliceStaticDhPub = "761d88ec830413919dfe9d4d1d56f17e653c8c994082df5b137b90a0ae6edf74";
    const { plaintext } = decryptDmDr(envelope, bob, bobSeed, aliceStaticDhPub);
    expect(plaintext).toBe("rust to ts vector");
  });
});
