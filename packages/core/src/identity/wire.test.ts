import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "../hex";
import {
  homeHubListSigningBytes,
  subkeyCertSigningBytes,
  revocationSigningBytes,
  pairingOfferSigningBytes,
  pairingClaimSigningBytes,
  buildPrefsBlob,
  prefsBlobSigningBytes,
  verifyPrefsBlob,
  buildHomeHubList,
  buildPairingClaim,
  buildPairingOffer,
  verifyPairingOffer,
  recoveryRequestSigningBytes,
  recoveryAttestationSigningBytes,
  federatedPlaintextDmSigningBytes,
  authChallengeSigningBytes,
  signRecoveryRequest,
  signRecoveryAttestation,
  type PairingComplete,
  type PairingStatus,
  type SignedPrefsBlob,
  type SubkeyCert,
} from "./wire";
import { masterPublicKeyHex } from "./master";
import { wrapBlobKey, unwrapBlobKey } from "./ecies";
import { fixture, vector } from "./wireVectors";

// Every expected output below comes from wire-vectors/wire-vectors.json, the
// server's vectors vendored byte-for-byte.
const MASTER_PUB = fixture("master_pub");
const SUBKEY_PUB = fixture("subkey_pub");
const SUBKEY_SEED = fixture("subkey_seed");

function seedHex(start: number): string {
  return Array.from({ length: 32 }, (_, i) => ((i + start) & 0xff).toString(16).padStart(2, "0")).join("");
}

function pubHex(seed: string): string {
  return bytesToHex(ed25519.getPublicKey(seed));
}
function signHex(bytes: Uint8Array, seed: string): string {
  return bytesToHex(ed25519.sign(bytes, seed));
}

describe("wire signing-bytes vectors", () => {
  it("derives the canonical master/subkey/new-key pubkeys", () => {
    for (const name of ["master_pubkey", "subkey_pubkey", "new_key_pubkey"]) {
      const v = vector(name);
      expect(pubHex(v.str("seed")), name).toBe(v.out("public_key"));
    }
  });

  it("HomeHubList", () => {
    const v = vector("home_hub_list");
    const [pub, hubs, ts, seq, seed] = [v.str("master_pubkey"), v.strs("hubs"), v.num("issued_at"), v.num("sequence"), v.str("signer_seed")];
    const sb = homeHubListSigningBytes(pub, hubs, ts, seq);
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, seed)).toBe(v.out("signature"));
    // Builder produces the same signature.
    expect(buildHomeHubList(seed, pub, hubs, ts, seq).signature).toBe(v.out("signature"));
  });

  it("SubkeyCert", () => {
    const v = vector("subkey_cert");
    expect(v.raw("not_after")).toBeNull();
    const sb = subkeyCertSigningBytes(
      v.str("master_pubkey"),
      v.str("subkey_pubkey"),
      v.str("device_label"),
      v.num("issued_at"),
      null,
      v.strs("fallback_hubs"),
    );
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, v.str("signer_seed"))).toBe(v.out("signature"));
  });

  it("RevocationEntry", () => {
    const v = vector("revocation");
    const sb = revocationSigningBytes(v.str("master_pubkey"), v.str("subkey_pubkey"), v.num("revoked_at"));
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, v.str("signer_seed"))).toBe(v.out("signature"));
  });

  it("PairingOffer", () => {
    const v = vector("pairing_offer");
    const sb = pairingOfferSigningBytes(
      v.str("master_pubkey"),
      v.strs("home_hubs"),
      v.str("pairing_token"),
      v.num("issued_at"),
      v.num("expires_at"),
    );
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, v.str("signer_seed"))).toBe(v.out("signature"));
  });

  it("a pairing offer verifies, and a tampered one does not", () => {
    // The claiming device checks this before it claims: the offer is the only
    // thing telling it whose identity it is joining, and it arrives over the
    // user's own screen rather than from the hub.
    const v = vector("pairing_offer");
    const offer = buildPairingOffer(
      v.str("signer_seed"),
      v.str("master_pubkey"),
      v.strs("home_hubs"),
      v.str("pairing_token"),
      v.num("issued_at"),
      v.num("expires_at"),
    );
    expect(offer.signature).toBe(v.out("signature"));
    expect(verifyPairingOffer(offer)).toBe(true);
    // A hub swapping in its own master is the attack the signature stops.
    expect(verifyPairingOffer({ ...offer, master_pubkey: SUBKEY_PUB })).toBe(false);
    expect(verifyPairingOffer({ ...offer, home_hubs: ["https://evil.example"] })).toBe(false);
    expect(verifyPairingOffer({ ...offer, pairing_token: "tok124" })).toBe(false);
  });

  it("PairingClaim (signed by subkey)", () => {
    const v = vector("pairing_claim");
    const [token, sub, label, seed] = [v.str("pairing_token"), v.str("subkey_pubkey"), v.str("device_label"), v.str("signer_seed")];
    const sb = pairingClaimSigningBytes(token, sub, label);
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, seed)).toBe(v.out("proof"));
    expect(buildPairingClaim(seed, token, sub, label).proof).toBe(v.out("proof"));
  });

  it("master derivation (HKDF) matches Rust", () => {
    const v = vector("master_from_entropy");
    expect(masterPublicKeyHex(v.str("entropy"))).toBe(v.out("public_key"));
  });

  it("SignedPrefsBlob", () => {
    const v = vector("prefs_blob");
    const [pub, version, ct] = [v.str("master_pubkey"), v.num("blob_version"), v.str("ciphertext")];
    const sb = prefsBlobSigningBytes(pub, version, hexToBytes(ct));
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, v.str("signer_seed"))).toBe(v.out("signature"));

    const blob: SignedPrefsBlob = {
      master_pubkey: pub,
      blob_version: version,
      ciphertext_hex: ct,
      signature: v.out("signature"),
    };
    expect(verifyPrefsBlob(blob)).toBe(true);
    expect(verifyPrefsBlob({ ...blob, blob_version: version + 1 })).toBe(false);
  });

  it("buildPrefsBlob produces exactly the envelope Rust signs and verifies", () => {
    const v = vector("prefs_blob");
    const [seed, pub, version, ct] = [v.str("signer_seed"), v.str("master_pubkey"), v.num("blob_version"), v.str("ciphertext")];
    const blob = buildPrefsBlob(seed, pub, version, ct);
    expect(blob.signature).toBe(v.out("signature"));
    expect(verifyPrefsBlob(blob)).toBe(true);
    // A version bump changes the signature — the hub's monotonic counter is
    // inside the signed bytes, so a replay at a lower version cannot verify.
    const bumped = buildPrefsBlob(seed, pub, version + 1, ct);
    expect(bumped.signature).not.toBe(blob.signature);
    expect(verifyPrefsBlob(bumped)).toBe(true);
  });
});

describe("recovery-attestation wire vectors", () => {
  it("recoveryRequestSigningBytes matches the server vector and proof", () => {
    const v = vector("recovery_request");
    const [hub, old, neu, seed] = [v.str("hub_pubkey"), v.str("old_pubkey"), v.str("new_pubkey"), v.str("signer_seed")];
    const sb = recoveryRequestSigningBytes(hub, old, neu);
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, seed)).toBe(v.out("proof"));
    expect(signRecoveryRequest(seed, hub, old, neu)).toBe(v.out("proof"));
  });

  it("recoveryAttestationSigningBytes matches the server vector and signature", () => {
    const v = vector("recovery_attestation");
    const [hub, old, neu, nonce, seed] = [
      v.str("hub_pubkey"),
      v.str("old_pubkey"),
      v.str("new_pubkey"),
      v.str("request_nonce"),
      v.str("signer_seed"),
    ];
    const sb = recoveryAttestationSigningBytes(hub, old, neu, nonce);
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, seed)).toBe(v.out("signature"));
    expect(signRecoveryAttestation(seed, hub, old, neu, nonce)).toBe(v.out("signature"));
  });

  it("authChallengeSigningBytes matches the server vector and signature", () => {
    const v = vector("auth_challenge");
    const sb = authChallengeSigningBytes(hexToBytes(v.str("challenge")));
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, v.str("signer_seed"))).toBe(v.out("signature"));
  });

  it("federatedPlaintextDmSigningBytes matches the server vector and signature", () => {
    const v = vector("federated_plaintext_dm");
    const sb = federatedPlaintextDmSigningBytes(v.str("conversation_id"), v.str("kind"), v.str("content"));
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(signHex(sb, v.str("signer_seed"))).toBe(v.out("signature"));
  });

  it("request and attestation bytes never collide (distinct tags)", () => {
    const v = vector("recovery_attestation");
    const [hub, old, neu] = [v.str("hub_pubkey"), v.str("old_pubkey"), v.str("new_pubkey")];
    const requestSb = recoveryRequestSigningBytes(hub, old, neu);
    const attestationSb = recoveryAttestationSigningBytes(hub, old, neu, v.str("request_nonce"));
    expect(bytesToHex(requestSb)).not.toBe(bytesToHex(attestationSb));
  });
});

// PairingComplete.wrapped_dh_seed_hex / PairingStatus.Complete — DM
// attribution fix (decisions.md "Paired-device DMs attribute to canonical
// via cert-chained envelopes; DH capability is a wrapped canonical scalar").
// PairingComplete carries no signing bytes of its own (only the nested
// `cert` is signed), so these are serde/JSON-shape checks mirroring
// server/crates/identity/tests/wire_vectors.rs's equivalents, not signature
// vectors.
describe("PairingComplete.wrapped_dh_seed_hex", () => {
  const sampleCert: SubkeyCert = {
    master_pubkey: MASTER_PUB,
    subkey_pubkey: SUBKEY_PUB,
    device_label: "laptop",
    issued_at: vector("subkey_cert").num("issued_at"),
    not_after: null,
    fallback_hubs: [],
    signature: vector("subkey_cert").out("signature"),
  };

  it("is optional — old JSON shape (no field) still parses as undefined", () => {
    const json = JSON.stringify({
      pairing_token: "tok123",
      cert: sampleCert,
      wrapped_blob_key_hex: "deadbeef",
    });
    const complete = JSON.parse(json) as PairingComplete;
    expect(complete.wrapped_dh_seed_hex).toBeUndefined();
  });

  it("round-trips through JSON when present", () => {
    const complete: PairingComplete = {
      pairing_token: "tok123",
      cert: sampleCert,
      wrapped_blob_key_hex: "deadbeef",
      wrapped_dh_seed_hex: "cafef00d",
    };
    const roundTripped = JSON.parse(JSON.stringify(complete)) as PairingComplete;
    expect(roundTripped.wrapped_dh_seed_hex).toBe("cafef00d");
  });

  it("PairingStatus Complete round-trips wrapped_dh_seed_hex through JSON", () => {
    const status: PairingStatus = {
      state: "complete",
      cert: sampleCert,
      wrapped_blob_key_hex: "deadbeef",
      wrapped_dh_seed_hex: "cafef00d",
    };
    const roundTripped = JSON.parse(JSON.stringify(status)) as PairingStatus;
    expect(roundTripped).toMatchObject({ wrapped_dh_seed_hex: "cafef00d" });
  });

  it("wraps and unwraps the canonical DH scalar with the existing ECIES primitive", () => {
    // Mirrors identity/tests/wire_vectors.rs's
    // wrapped_dh_scalar_round_trips_through_existing_ecies_primitive: the
    // enrolling device wraps the canonical X25519 scalar (not the Ed25519
    // seed) for the claiming subkey; the claiming device unwraps with its
    // own seed.
    const masterDhScalar = new Uint8Array(32).map((_, i) => (i * 13 + 5) & 0xff);
    const wrapped = wrapBlobKey(masterDhScalar, SUBKEY_PUB);
    expect(Array.from(unwrapBlobKey(wrapped, SUBKEY_SEED))).toEqual(Array.from(masterDhScalar));
  });
});

describe("ECIES wrap/unwrap", () => {
  it("round-trips a blob key to a recipient's ed25519 identity", () => {
    const recipientSeed = seedHex(0x40);
    const recipientPub = pubHex(recipientSeed);
    const blobKey = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
    const wrapped = wrapBlobKey(blobKey, recipientPub);
    expect(wrapped.length).toBe(184); // 92 bytes
    expect(Array.from(unwrapBlobKey(wrapped, recipientSeed))).toEqual(Array.from(blobKey));
  });

  it("rejects unwrap by the wrong recipient", () => {
    const recipientSeed = seedHex(0x40);
    const attackerSeed = seedHex(0x60);
    const wrapped = wrapBlobKey(new Uint8Array(32).fill(9), pubHex(recipientSeed));
    expect(() => unwrapBlobKey(wrapped, attackerSeed)).toThrow();
  });
});
