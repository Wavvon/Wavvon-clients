// Group DM sender keys (e2e-encryption.md "Group DMs — v2"). The signing
// bytes are pinned to the server's vectors; the ratchet and the wrap to one
// vector the desktop shell asserts too (dm.rs group_ratchet_matches_the_web_vector).
import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "../hex";
import {
  dhKeypairFromSeed,
  decryptGroupMessage,
  encryptGroupMessage,
  groupEnvelopeSigningBytes,
  groupMessageKey,
  groupNextChainKey,
  senderKeyDistSigningBytes,
  unwrapGroupChainKey,
  wrapGroupChainKey,
} from "./crypto";
import { fixture, vector } from "./wireVectors";

describe("group DM signing bytes", () => {
  it("match the group envelope vector", () => {
    const v = vector("group_dm_envelope");
    const sb = groupEnvelopeSigningBytes(
      v.str("conversation_id"), v.num("sender_key_version"), v.num("iteration"), v.str("ciphertext"), v.str("nonce"),
    );
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(bytesToHex(ed25519.sign(sb, v.str("signer_seed")))).toBe(v.out("signature"));
  });

  it("match the key distribution vector, sorting the recipients", () => {
    const v = vector("sender_key_dist");
    const recipients = (v.raw("recipients") as string[][]).map(
      ([pk, w]) => [pk.startsWith("@") ? fixture(pk.slice(1)) : pk, w] as [string, string],
    );
    const sb = senderKeyDistSigningBytes(v.str("conversation_id"), v.num("version"), recipients);
    expect(bytesToHex(sb)).toBe(v.out("signing_bytes"));
    expect(bytesToHex(ed25519.sign(sb, v.str("signer_seed")))).toBe(v.out("signature"));
  });
});

describe("group ratchet", () => {
  const ck = new Uint8Array(32).fill(0x11);
  const alice = dhKeypairFromSeed(fixture("master_seed"));
  const bob = dhKeypairFromSeed(fixture("subkey_seed"));

  it("derives the same keys as the desktop shell", () => {
    expect(bytesToHex(groupMessageKey(ck, 2))).toBe("7de5c477aadff1d7633bce5fc6d6974b908b9d05a3897cd5aba30c6490eba427");
    expect(bytesToHex(groupNextChainKey(ck, 2))).toBe("fd8b5df061c574c9c5ecdb3d87c37f54bb6c48585a6253b7914a1144d75939dc");
    const wrap = wrapGroupChainKey(alice.dhPriv, bob.dhPub, "conv123", ck, 2, hexToBytes("0102030405060708090a0b0c"));
    expect(wrap.wrappedHex).toBe("354ebd62de34d85fbd7179d96abf4202938c5609e18bc6015926550c48ec21bd5702ae96b979f0bf45ab36a7158bc5d204e173e7");
  });

  it("unwraps what it wraps, from the other side", () => {
    const wrap = wrapGroupChainKey(alice.dhPriv, bob.dhPub, "conv123", ck, 7);
    const got = unwrapGroupChainKey(bob.dhPriv, alice.dhPub, "conv123", wrap.wrappedHex, wrap.nonceHex);
    expect(bytesToHex(got.chainKey)).toBe(bytesToHex(ck));
    expect(got.iteration).toBe(7);
  });

  it("decrypts a later message from an earlier held key, never an earlier one", () => {
    const m0 = encryptGroupMessage(ck, 0, { content: "first" });
    const m1 = encryptGroupMessage(m0.nextChainKey, 1, { content: "second" });
    expect(decryptGroupMessage(ck, 0, 1, m1.ciphertextHex, m1.nonceHex).content).toBe("second");
    expect(decryptGroupMessage(ck, 0, 0, m0.ciphertextHex, m0.nonceHex).content).toBe("first");
    expect(() => decryptGroupMessage(m0.nextChainKey, 1, 0, m0.ciphertextHex, m0.nonceHex)).toThrow();
  });
});
