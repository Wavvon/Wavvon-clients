import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "../hex";
import {
  homeHubListSigningBytes,
  subkeyCertSigningBytes,
  revocationSigningBytes,
  pairingOfferSigningBytes,
  pairingClaimSigningBytes,
  prefsBlobSigningBytes,
  verifyPrefsBlob,
  buildHomeHubList,
  buildPairingClaim,
  type PairingComplete,
  type PairingStatus,
  type SignedPrefsBlob,
  type SubkeyCert,
} from "./wire";
import { masterPublicKeyHex } from "./master";
import { wrapBlobKey, unwrapBlobKey } from "./ecies";

// Canonical vectors — must match server/crates/identity/tests/wire_vectors.rs
// byte-for-byte. Fixed inputs: master seed 0x01..0x20, subkey seed 0x21..0x40,
// timestamp 1_700_000_000.
const TS = 1_700_000_000;
const MASTER_PUB = "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";
const SUBKEY_PUB = "e7f162a10bec559afea195e4dce84b69568d5d2cb0963eb446c0685e2b17f2f0";

function seedHex(start: number): string {
  return Array.from({ length: 32 }, (_, i) => ((i + start) & 0xff).toString(16).padStart(2, "0")).join("");
}
const MASTER_SEED = seedHex(1); // 0x01..0x20
const SUBKEY_SEED = seedHex(0x21); // 0x21..0x40

const HOME_HUB_LIST_SIGNING_BYTES =
  "776176766f6e2f686f6d652d6875622d6c6973742f7631004000000037396235353632653866653635346639343037386231313265386139386261373930316638353361653639356265643765306533393130626164303439363634010000001300000068747470733a2f2f6875622e6578616d706c6500f15365000000000100000000000000";
const HOME_HUB_LIST_SIG =
  "193d446382d6dde14c0d85cf3b92a13858c7daa702bf284688af0514019de5665dbe52be683d41f85fa004c2b0c8be329ac608dbb18a4c03e9e0fd4380db0907";
const SUBKEY_CERT_SIGNING_BYTES =
  "776176766f6e2f7375626b65792d636572742f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630060000006c6170746f7000f15365000000000000000000";
const SUBKEY_CERT_SIG =
  "ba99a98b72bef53d3dfc4767728806ca27cd247ecc11383453696d0011fc586e9eaf583c9632ff2805358dfda0de59f0cc8ca9aad33a5877be0d680b40513209";
const REVOCATION_SIGNING_BYTES =
  "776176766f6e2f7265766f636174696f6e2f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630f4f2536500000000";
const REVOCATION_SIG =
  "6020787fb48d42085cbc7dbd8b3c78c7a4d1bcaa390baf2a9248af5d1d4b240813e2775acb86820f4ec106ae3b36df01a65c1db784fc40b36f279af50e0d910d";
const PAIRING_OFFER_SIGNING_BYTES =
  "776176766f6e2f70616972696e672d6f666665722f7631004000000037396235353632653866653635346639343037386231313265386139386261373930316638353361653639356265643765306533393130626164303439363634010000001300000068747470733a2f2f6875622e6578616d706c6506000000746f6b31323300f15365000000002cf2536500000000";
const PAIRING_OFFER_SIG =
  "93add8ced681c4dda4060417ba2f7301bff6a64876d015c30fa976307edeec75b69ff0af42a9415a50ce605ef2c561a70d19de0820334c16054336f904ec540f";
const PAIRING_CLAIM_SIGNING_BYTES =
  "776176766f6e2f70616972696e672d636c61696d2f76310006000000746f6b3132334000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630060000006c6170746f70";
const PAIRING_CLAIM_PROOF =
  "cea1002c8bcad922848865158e5e7b2a7241929fcb13ce4a288e52cfecf912b71e2527ee0929198c2450027fb06ae04ac5f82acfffca28494feca7d253e22709";
// HKDF master pubkey for entropy 0x01..0x20 — MASTER_FROM_ENTROPY_PUB vector.
const MASTER_FROM_ENTROPY_PUB =
  "8fbafd0f662f225430eed18b132b3de956dc7d75c95b26baa97ada69aab51565";
// SignedPrefsBlob is signed by the *master* seed (HKDF-derived from entropy
// 0x01..0x20), not the raw entropy directly — see master.ts/derivePrefsBlobKey.
const MASTER_SEED_FROM_ENTROPY = "5a5d527b13bccb7a21160cbe6d433b0c59e2793f27df43b74759da500b3b78c0";
const PREFS_BLOB_CIPHERTEXT_HEX =
  "00000000000000000000000065338dfb57de69d2d7dee5cbd93fefba9e93f9e4f966cf6909f30bd96b29b6ee9b597cc02040ccfab8729f3cc8a3d906c91007fb07cbbf2660413dfc7256156cf27e73b271f16acf6b8ce6472e28141800ecdc62";
const PREFS_BLOB_SIGNING_BYTES =
  "776176766f6e2f70726566732d626c6f622f763100400000003866626166643066363632663232353433306565643138623133326233646539353664633764373563393562323662616139376164613639616162353135363503000000000000000a015cc67e45a14790a049a60154e36306d4367c8bbf521999118fede8ba2e6c";
const PREFS_BLOB_SIG =
  "bcc7e3235c6e78c174b9e7f8797303d633c2e20376333dd9eee321fc783ed860fe624598817f0d2c897d51d30c57d6e57c7e454814852aba939a93380b6e5e07";

function pubHex(seed: string): string {
  return bytesToHex(ed25519.getPublicKey(seed));
}
function signHex(bytes: Uint8Array, seed: string): string {
  return bytesToHex(ed25519.sign(bytes, seed));
}

describe("wire signing-bytes vectors", () => {
  it("derives the canonical master/subkey pubkeys", () => {
    expect(pubHex(MASTER_SEED)).toBe(MASTER_PUB);
    expect(pubHex(SUBKEY_SEED)).toBe(SUBKEY_PUB);
  });

  it("HomeHubList", () => {
    const hubs = ["https://hub.example"];
    const sb = homeHubListSigningBytes(MASTER_PUB, hubs, TS, 1);
    expect(bytesToHex(sb)).toBe(HOME_HUB_LIST_SIGNING_BYTES);
    expect(signHex(sb, MASTER_SEED)).toBe(HOME_HUB_LIST_SIG);
    // Builder produces the same signature.
    expect(buildHomeHubList(MASTER_SEED, MASTER_PUB, hubs, TS, 1).signature).toBe(HOME_HUB_LIST_SIG);
  });

  it("SubkeyCert", () => {
    const sb = subkeyCertSigningBytes(MASTER_PUB, SUBKEY_PUB, "laptop", TS, null, []);
    expect(bytesToHex(sb)).toBe(SUBKEY_CERT_SIGNING_BYTES);
    expect(signHex(sb, MASTER_SEED)).toBe(SUBKEY_CERT_SIG);
  });

  it("RevocationEntry", () => {
    const sb = revocationSigningBytes(MASTER_PUB, SUBKEY_PUB, TS + 500);
    expect(bytesToHex(sb)).toBe(REVOCATION_SIGNING_BYTES);
    expect(signHex(sb, MASTER_SEED)).toBe(REVOCATION_SIG);
  });

  it("PairingOffer", () => {
    const sb = pairingOfferSigningBytes(MASTER_PUB, ["https://hub.example"], "tok123", TS, TS + 300);
    expect(bytesToHex(sb)).toBe(PAIRING_OFFER_SIGNING_BYTES);
    expect(signHex(sb, MASTER_SEED)).toBe(PAIRING_OFFER_SIG);
  });

  it("PairingClaim (signed by subkey)", () => {
    const sb = pairingClaimSigningBytes("tok123", SUBKEY_PUB, "laptop");
    expect(bytesToHex(sb)).toBe(PAIRING_CLAIM_SIGNING_BYTES);
    expect(signHex(sb, SUBKEY_SEED)).toBe(PAIRING_CLAIM_PROOF);
    expect(buildPairingClaim(SUBKEY_SEED, "tok123", SUBKEY_PUB, "laptop").proof).toBe(PAIRING_CLAIM_PROOF);
  });

  it("master derivation (HKDF) matches Rust", () => {
    expect(masterPublicKeyHex(MASTER_SEED)).toBe(MASTER_FROM_ENTROPY_PUB);
  });

  it("SignedPrefsBlob (generated against wavvon_identity::SignedPrefsBlob directly)", () => {
    const sb = prefsBlobSigningBytes(MASTER_FROM_ENTROPY_PUB, 3, hexToBytes(PREFS_BLOB_CIPHERTEXT_HEX));
    expect(bytesToHex(sb)).toBe(PREFS_BLOB_SIGNING_BYTES);
    expect(signHex(sb, MASTER_SEED_FROM_ENTROPY)).toBe(PREFS_BLOB_SIG);

    const blob: SignedPrefsBlob = {
      master_pubkey: MASTER_FROM_ENTROPY_PUB,
      blob_version: 3,
      ciphertext_hex: PREFS_BLOB_CIPHERTEXT_HEX,
      signature: PREFS_BLOB_SIG,
    };
    expect(verifyPrefsBlob(blob)).toBe(true);
    expect(verifyPrefsBlob({ ...blob, blob_version: 4 })).toBe(false);
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
    issued_at: TS,
    not_after: null,
    fallback_hubs: [],
    signature: SUBKEY_CERT_SIG,
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
