// Canonical wire-format vectors from hub/docs/wire-format.md (enforced
// server-side by hub/identity/tests/wire_vectors.rs). These pin the
// hand-written encoders in crypto.ts to the exact bytes the hub
// produces, so the formats cannot drift apart.
//
// Fixed inputs:
//   master seed: 0x01 0x02 … 0x20  (32 bytes)
//   timestamp  : 1_700_000_000  (unix seconds)
import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "../hex";
import {
  dhKeypairFromSeed,
  dhKeySigningBytes,
  dmEnvelopeSigningBytes,
  publicKeyHex,
} from "./crypto";

const masterSeed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

const MASTER_PUB =
  "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";

// X25519 DH pubkey derived from the master seed (SHA-512 + clamp)
const MASTER_DH_PUB =
  "4a3807d064d077181cc070989e76891d20dca5559548dc2c77c1a50273882b38";

const DH_KEY_RECORD_SIGNING_BYTES =
  "776176766f6e2f64682d6b65792f76310040000000373962353536326538666536353466393430373862313132653861393862613739303166383533616536393562656437653065333931306261643034393636344000000034613338303764303634643037373138316363303730393839653736383931643230646361353535393534386463326337376331613530323733383832623338";
const DH_KEY_RECORD_SIG =
  "6fbb512c648347920f714a831b0e1b13266c60fef157fd93922092e04bb281ecc2918d6bd6ffce7e6602463753188fde022d04763bc30cd5d720829ddcff5603";

// Shared DM-envelope fixed inputs
const DM_CONV_ID = "conv123";
const DM_CIPHERTEXT_HEX = "63697068657274657874"; // hex("ciphertext")
const DM_NONCE_HEX = "0102030405060708090a0b0c";

const DM_ENVELOPE_SIGNING_BYTES =
  "776176766f6e2f646d2d636970686572746578742f76310007000000636f6e76313233140000003633363937303638363537323734363537383734180000003031303230333034303530363037303830393061306230634000000034613338303764303634643037373138316363303730393839653736383931643230646361353535393534386463326337376331613530323733383832623338";
const DM_ENVELOPE_SIG =
  "6d41d6b3f9f4c5b5d87a7d819f4e9b2e1a1340c3aa97cf044037f926c63710dd3edeb5bc66d9dfa89fc0d9fe2a67b8a28c6c5908f42b947b3551c04dbf113709";

describe("fixed key vectors", () => {
  it("derives the master public key", () => {
    expect(publicKeyHex(bytesToHex(masterSeed))).toBe(MASTER_PUB);
  });
});

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
