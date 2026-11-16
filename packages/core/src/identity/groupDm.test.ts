// Group DM sender keys (e2e-encryption.md "Group DMs — v2"). The signing
// bytes are pinned to the server's vectors; the ratchet and the wrap to the
// group_ratchet and group_key_wrap vectors (dmVectors.test.ts).
import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "../hex";
import {
  dhKeypairFromSeed,
  decryptGroupMessage,
  encryptGroupMessage,
  groupEnvelopeSigningBytes,
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
