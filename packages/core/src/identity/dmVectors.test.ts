// The E2E DM encryption vectors (dm_key_v1, dr_session, group_ratchet,
// group_key_wrap) from the server's wire-vectors.json. They pin the key
// derivations and AEAD, not just the signing bytes, so any SDK can assert them.
import { describe, it, expect } from "vitest";
import { gcm } from "@noble/ciphers/aes";
import { x25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "../hex";
import {
  decryptDm,
  decryptDmDr,
  decryptGroupMessage,
  deriveNonce,
  dhKeypairFromSeed,
  groupMessageKey,
  groupNextChainKey,
  groupNonce,
  kdfCk,
  kdfRk,
  unwrapGroupChainKey,
  wrapGroupChainKey,
  type DrEnvelope,
} from "./crypto";
import { vector } from "./wireVectors";

const utf8 = (s: string) => new TextEncoder().encode(s);
const seal = (key: Uint8Array, nonce: Uint8Array, plaintext: string) =>
  bytesToHex(gcm(key, nonce).encrypt(utf8(plaintext)));

describe("dm_key_v1", () => {
  it("decrypts the vector's ciphertext with the vector's key", () => {
    const v = vector("dm_key_v1");
    const alice = dhKeypairFromSeed(v.str("alice_seed"));
    const bob = dhKeypairFromSeed(v.str("bob_seed"));
    const nonceHex = v.str("nonce");
    const env = {
      sender_pubkey: "",
      conv_id: v.str("conversation_id"),
      ciphertext_hex: v.out("ciphertext"),
      nonce_hex: nonceHex,
      dh_pubkey_hex: bytesToHex(alice.dhPub),
      signature_hex: "",
    };
    expect(decryptDm(v.str("conversation_id"), env, bob.dhPriv)).toBe(
      JSON.parse(v.str("plaintext")).content,
    );
    expect(seal(hexToBytes(v.out("key")), hexToBytes(nonceHex), v.str("plaintext"))).toBe(v.out("ciphertext"));
  });
});

describe("dr_session", () => {
  const v = vector("dr_session");
  const bobStatic = dhKeypairFromSeed(v.str("bob_seed"));
  const aliceStatic = dhKeypairFromSeed(v.str("alice_seed"));
  const aliceEph = hexToBytes(v.str("alice_eph_secret"));
  const bobEph = hexToBytes(v.str("bob_eph_secret"));

  it("a responder opens message 0 from the vector, through decryptDmDr", () => {
    const env: DrEnvelope = {
      sender_pubkey: "",
      conv_id: v.str("conversation_id"),
      ciphertext_hex: v.out("ciphertext"),
      nonce_hex: "",
      dh_pubkey_hex: v.out("alice_eph_pub"),
      signature_hex: "",
      v: 2,
      message_index: 0,
      prev_count: 0,
    };
    const empty = { rk: "", cks: null, ckr: null, ns: 0, nr: 0, pn: 0, dhsPriv: "", dhsPub: "", dhr: null, mkskipped: {} };
    const { plaintext, updatedSession } = decryptDmDr(env, empty, v.str("bob_seed"), bytesToHex(aliceStatic.dhPub));
    expect(plaintext).toBe(JSON.parse(v.str("plaintext")).content);
    // The receiving chain ends one step past the vector's alice_cks.
    expect(updatedSession.ckr).toBe(v.out("next_cks"));
  });

  it("derives every key and ciphertext of the vector", () => {
    const aliceEphPub = x25519.scalarMultBase(aliceEph);
    expect(bytesToHex(aliceEphPub)).toBe(v.out("alice_eph_pub"));
    const rk0 = hexToBytes(v.out("rk0"));
    const [rk, cks] = kdfRk(rk0, x25519.scalarMult(aliceEph, bobStatic.dhPub));
    expect(bytesToHex(rk)).toBe(v.out("alice_rk"));
    expect(bytesToHex(cks)).toBe(v.out("alice_cks"));
    const [mk, next] = kdfCk(cks);
    expect(bytesToHex(mk)).toBe(v.out("message_key"));
    expect(bytesToHex(deriveNonce(mk))).toBe(v.out("nonce"));
    expect(bytesToHex(next)).toBe(v.out("next_cks"));
    expect(seal(mk, deriveNonce(mk), v.str("plaintext"))).toBe(v.out("ciphertext"));

    const [rk1] = kdfRk(rk0, x25519.scalarMult(bobStatic.dhPriv, aliceEphPub));
    const [bobRk, bobCks] = kdfRk(rk1, x25519.scalarMult(bobEph, aliceEphPub));
    expect(bytesToHex(bobRk)).toBe(v.out("bob_rk"));
    expect(bytesToHex(bobCks)).toBe(v.out("bob_cks"));
    expect(bytesToHex(x25519.scalarMultBase(bobEph))).toBe(v.out("bob_eph_pub"));
    const [replyMk] = kdfCk(bobCks);
    expect(bytesToHex(replyMk)).toBe(v.out("reply_message_key"));
    expect(seal(replyMk, deriveNonce(replyMk), v.str("reply_plaintext"))).toBe(v.out("reply_ciphertext"));

    const [stepRk, stepCkr] = kdfRk(rk, x25519.scalarMult(aliceEph, x25519.scalarMultBase(bobEph)));
    expect(bytesToHex(stepRk)).toBe(v.out("reply_step_rk"));
    expect(bytesToHex(stepCkr)).toBe(v.out("reply_step_ckr"));
  });
});

describe("group_ratchet", () => {
  it("derives the vector's keys, nonce and ciphertext", () => {
    const v = vector("group_ratchet");
    const ck = hexToBytes(v.str("chain_key"));
    const it_ = v.num("iteration");
    expect(bytesToHex(groupMessageKey(ck, it_))).toBe(v.out("message_key"));
    expect(bytesToHex(groupNextChainKey(ck, it_))).toBe(v.out("next_chain_key"));
    expect(bytesToHex(groupNonce(it_))).toBe(v.out("nonce"));
    expect(seal(groupMessageKey(ck, it_), groupNonce(it_), v.str("plaintext"))).toBe(v.out("ciphertext"));
    expect(decryptGroupMessage(ck, it_, it_, v.out("ciphertext"), v.out("nonce")).content).toBe(
      JSON.parse(v.str("plaintext")).content,
    );
  });
});

describe("group_key_wrap", () => {
  it("wraps to the vector's ciphertext and unwraps from the other side", () => {
    const v = vector("group_key_wrap");
    const sender = dhKeypairFromSeed(v.str("sender_seed"));
    const recipient = dhKeypairFromSeed(v.str("recipient_seed"));
    const ck = hexToBytes(v.str("chain_key"));
    const wrap = wrapGroupChainKey(
      sender.dhPriv, recipient.dhPub, v.str("conversation_id"), ck, v.num("iteration"), hexToBytes(v.str("nonce")),
    );
    expect(wrap.wrappedHex).toBe(v.out("ciphertext"));
    expect(wrap.nonceHex).toBe(v.str("nonce"));
    const got = unwrapGroupChainKey(recipient.dhPriv, sender.dhPub, v.str("conversation_id"), wrap.wrappedHex, wrap.nonceHex);
    expect(bytesToHex(got.chainKey)).toBe(bytesToHex(ck));
    expect(got.iteration).toBe(v.num("iteration"));
  });
});
