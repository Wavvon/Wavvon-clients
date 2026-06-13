// Canonical wire-format vectors from hub/docs/wire-format.md (enforced
// server-side by hub/identity/tests/wire_vectors.rs). These pin the
// hand-written encoders in wire.ts to the exact bytes the hub produces,
// so the formats cannot drift apart.
//
// Fixed inputs:
//   master seed: 0x01 0x02 … 0x20  (32 bytes)
//   subkey seed: 0x21 0x22 … 0x40  (32 bytes)
//   timestamp  : 1_700_000_000  (unix seconds)
import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@voxply/utils";
import {
  offerSigningBytes,
  subkeyCertSigningBytes,
  claimSigningBytes,
} from "./wire";
import {
  dhKeypairFromSeed,
  dhKeySigningBytes,
  dmEnvelopeSigningBytes,
} from "./crypto";

const TS = 1_700_000_000;

const masterSeed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const subkeySeed = Uint8Array.from({ length: 32 }, (_, i) => i + 0x21);

const MASTER_PUB =
  "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";
const SUBKEY_PUB =
  "e7f162a10bec559afea195e4dce84b69568d5d2cb0963eb446c0685e2b17f2f0";

const PAIRING_OFFER_SIGNING_BYTES =
  "766f78706c792f70616972696e672d6f666665722f7631004000000037396235353632653866653635346639343037386231313265386139386261373930316638353361653639356265643765306533393130626164303439363634010000001300000068747470733a2f2f6875622e6578616d706c6506000000746f6b31323300f15365000000002cf2536500000000";
const PAIRING_OFFER_SIG =
  "e7ed2fb82e5c195e532ce949f8804c2069854697abd744f532c490322fa42af4b8708bb473762a0261dfeb7a8209ef165849e7bc08f653d41f0b8064b89e470a";

const SUBKEY_CERT_SIGNING_BYTES =
  "766f78706c792f7375626b65792d636572742f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630060000006c6170746f7000f15365000000000000000000";
const SUBKEY_CERT_SIG =
  "90a7abf5cf8915efea90740ab0e0b8f09ed93343584dbddeb7b593a1f0c4c4c883590f88e5ce46d14bd986cb4081e0860850934031c8343f82335699fd95fc04";

const PAIRING_CLAIM_SIGNING_BYTES =
  "766f78706c792f70616972696e672d636c61696d2f76310006000000746f6b3132334000000065376631363261313062656335353961666561313935653464636538346236393536386435643263623039363365623434366330363835653262313766326630060000006c6170746f70";
const PAIRING_CLAIM_PROOF =
  "e2eeee6d5b5032974c19b6aff42361829846f2e26e7e329985ad709d6b8c6f45e48156adcb75301570759bd14a1e192f4499fa0273adab1ee3db900821663608";

describe("fixed key vectors", () => {
  it("derives the master public key", () => {
    expect(bytesToHex(ed25519.getPublicKey(masterSeed))).toBe(MASTER_PUB);
  });

  it("derives the subkey public key", () => {
    expect(bytesToHex(ed25519.getPublicKey(subkeySeed))).toBe(SUBKEY_PUB);
  });
});

describe("offerSigningBytes (PairingOffer)", () => {
  it("reproduces the canonical signing bytes", () => {
    const sb = offerSigningBytes(
      MASTER_PUB,
      ["https://hub.example"],
      "tok123",
      TS,
      TS + 300,
    );
    expect(bytesToHex(sb)).toBe(PAIRING_OFFER_SIGNING_BYTES);
  });

  it("reproduces the canonical master signature", () => {
    const sb = offerSigningBytes(
      MASTER_PUB,
      ["https://hub.example"],
      "tok123",
      TS,
      TS + 300,
    );
    expect(bytesToHex(ed25519.sign(sb, masterSeed))).toBe(PAIRING_OFFER_SIG);
  });
});

describe("subkeyCertSigningBytes (SubkeyCert)", () => {
  it("reproduces the canonical signing bytes", () => {
    const sb = subkeyCertSigningBytes(MASTER_PUB, SUBKEY_PUB, "laptop", TS, null, []);
    expect(bytesToHex(sb)).toBe(SUBKEY_CERT_SIGNING_BYTES);
  });

  it("reproduces the canonical master signature", () => {
    const sb = subkeyCertSigningBytes(MASTER_PUB, SUBKEY_PUB, "laptop", TS, null, []);
    expect(bytesToHex(ed25519.sign(sb, masterSeed))).toBe(SUBKEY_CERT_SIG);
  });

  it("encodes a present not_after as 0x01 + u64 LE", () => {
    const without = subkeyCertSigningBytes(MASTER_PUB, SUBKEY_PUB, "laptop", TS, null, []);
    const withNotAfter = subkeyCertSigningBytes(
      MASTER_PUB,
      SUBKEY_PUB,
      "laptop",
      TS,
      TS + 1000,
      [],
    );
    // Option encoding grows the buffer by the 8-byte timestamp.
    expect(withNotAfter.length).toBe(without.length + 8);
  });
});

describe("claimSigningBytes (PairingClaim)", () => {
  it("reproduces the canonical signing bytes", () => {
    const sb = claimSigningBytes("tok123", SUBKEY_PUB, "laptop");
    expect(bytesToHex(sb)).toBe(PAIRING_CLAIM_SIGNING_BYTES);
  });

  it("reproduces the canonical subkey proof signature", () => {
    const sb = claimSigningBytes("tok123", SUBKEY_PUB, "laptop");
    expect(bytesToHex(ed25519.sign(sb, subkeySeed))).toBe(PAIRING_CLAIM_PROOF);
  });
});

// X25519 DH pubkey derived from the master seed (SHA-512 + clamp)
const MASTER_DH_PUB =
  "4a3807d064d077181cc070989e76891d20dca5559548dc2c77c1a50273882b38";

const DH_KEY_RECORD_SIGNING_BYTES =
  "766f78706c792f64682d6b65792f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000034613338303764303634643037373138316363303730393839653736383931643230646361353535393534386463326337376331613530323733383832623338";
const DH_KEY_RECORD_SIG =
  "055425d9cd0d2488c89bb9b0cc13f7ccb7f8581d20ba767123d4131bff9dd6abbb24b73c111777602d79b4cf4f7f8cc7c9eb0f3b3409bb2f1ab422330a2a7807";

// Shared DM-envelope fixed inputs
const DM_CONV_ID = "conv123";
const DM_CIPHERTEXT_HEX = "63697068657274657874"; // hex("ciphertext")
const DM_NONCE_HEX = "0102030405060708090a0b0c";

const DM_ENVELOPE_SIGNING_BYTES =
  "766f78706c792f646d2d636970686572746578742f76310007000000636f6e76313233140000003633363937303638363537323734363537383734180000003031303230333034303530363037303830393061306230634000000034613338303764303634643037373138316363303730393839653736383931643230646361353535393534386463326337376331613530323733383832623338";
const DM_ENVELOPE_SIG =
  "cacd0b3e90b7b09c25d0a2ae508470338a1b6c5b73935ba6245125c13c6bdc67bf647f9e108b59ea3ca913c3e7ad55b6c3a3157b9e95afc995ed9c22f9f34506";

describe("dhKeypairFromSeed (ed25519 → x25519 derivation)", () => {
  it("derives the canonical master DH public key", () => {
    const { dhPub } = dhKeypairFromSeed(bytesToHex(masterSeed));
    expect(bytesToHex(dhPub)).toBe(MASTER_DH_PUB);
  });
});

describe("dhKeySigningBytes (DhKeyRecord)", () => {
  it("reproduces the canonical signing bytes", () => {
    const sb = dhKeySigningBytes(MASTER_PUB, MASTER_DH_PUB);
    expect(bytesToHex(sb)).toBe(DH_KEY_RECORD_SIGNING_BYTES);
  });

  it("reproduces the canonical master signature", () => {
    const sb = dhKeySigningBytes(MASTER_PUB, MASTER_DH_PUB);
    expect(bytesToHex(ed25519.sign(sb, masterSeed))).toBe(DH_KEY_RECORD_SIG);
  });
});

describe("dmEnvelopeSigningBytes (EncryptedDmEnvelope)", () => {
  it("reproduces the canonical signing bytes", () => {
    const sb = dmEnvelopeSigningBytes(
      DM_CONV_ID,
      DM_CIPHERTEXT_HEX,
      DM_NONCE_HEX,
      MASTER_DH_PUB,
    );
    expect(bytesToHex(sb)).toBe(DM_ENVELOPE_SIGNING_BYTES);
  });

  it("reproduces the canonical master signature", () => {
    const sb = dmEnvelopeSigningBytes(
      DM_CONV_ID,
      DM_CIPHERTEXT_HEX,
      DM_NONCE_HEX,
      MASTER_DH_PUB,
    );
    expect(bytesToHex(ed25519.sign(sb, masterSeed))).toBe(DM_ENVELOPE_SIG);
  });
});
