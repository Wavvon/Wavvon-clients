// Vectors from wire-vectors/wire-vectors.json (the server's vectors, vendored
// byte-for-byte) — pin this file's encoders to the exact bytes the Rust
// identity crate produces.
import { describe, it, expect } from "vitest";
import { bytesToHex, hexToBytes } from "../hex";
import { dhKeypairFromSeed } from "./crypto";
import { voiceKeyWrap, voiceKeyUnwrap, voicePacketSeal, voicePacketOpen } from "./voice";
import { vector } from "./wireVectors";

const wrap = vector("voice_key_wrap");
const SENDER_SEED = hexToBytes(wrap.str("sender_seed"));
const RECIPIENT_SEED = hexToBytes(wrap.str("recipient_seed"));
const SENDER_KEY = hexToBytes(wrap.str("sender_key"));
const CHANNEL_ID = wrap.str("channel_id");
const NONCE_SALT = hexToBytes(wrap.str("nonce_salt"));
const KEY_ID = wrap.num("key_id");
const WRAP_NONCE = hexToBytes(wrap.str("wrap_nonce"));

describe("voiceKeyWrap / voiceKeyUnwrap", () => {
  it("matches the fixed wrap vector", () => {
    const recipientPub = dhKeypairFromSeed(bytesToHex(RECIPIENT_SEED)).dhPub;

    const { ciphertext, nonce } = voiceKeyWrap(
      SENDER_SEED,
      recipientPub,
      CHANNEL_ID,
      SENDER_KEY,
      NONCE_SALT,
      KEY_ID,
      WRAP_NONCE,
    );

    expect(bytesToHex(nonce)).toBe(bytesToHex(WRAP_NONCE));
    expect(bytesToHex(ciphertext)).toBe(wrap.out("ciphertext"));
  });

  it("unwraps the fixed vector back to sender_key/nonce_salt/key_id", () => {
    const senderPub = dhKeypairFromSeed(bytesToHex(SENDER_SEED)).dhPub;

    const { senderKey, nonceSalt, keyId } = voiceKeyUnwrap(
      RECIPIENT_SEED,
      senderPub,
      CHANNEL_ID,
      hexToBytes(wrap.out("ciphertext")),
      WRAP_NONCE,
    );

    expect(bytesToHex(senderKey)).toBe(bytesToHex(SENDER_KEY));
    expect(bytesToHex(nonceSalt)).toBe(bytesToHex(NONCE_SALT));
    expect(keyId).toBe(KEY_ID);
  });

  it("round-trips with a random wrap nonce", () => {
    const recipientPub = dhKeypairFromSeed(bytesToHex(RECIPIENT_SEED)).dhPub;
    const senderPub = dhKeypairFromSeed(bytesToHex(SENDER_SEED)).dhPub;

    const { ciphertext, nonce } = voiceKeyWrap(
      SENDER_SEED,
      recipientPub,
      "chan-round-trip",
      SENDER_KEY,
      NONCE_SALT,
      7,
    );

    const unwrapped = voiceKeyUnwrap(RECIPIENT_SEED, senderPub, "chan-round-trip", ciphertext, nonce);
    expect(bytesToHex(unwrapped.senderKey)).toBe(bytesToHex(SENDER_KEY));
    expect(bytesToHex(unwrapped.nonceSalt)).toBe(bytesToHex(NONCE_SALT));
    expect(unwrapped.keyId).toBe(7);
  });

  it("rejects unwrap under the wrong channel id", () => {
    const recipientPub = dhKeypairFromSeed(bytesToHex(RECIPIENT_SEED)).dhPub;
    const senderPub = dhKeypairFromSeed(bytesToHex(SENDER_SEED)).dhPub;

    const { ciphertext, nonce } = voiceKeyWrap(SENDER_SEED, recipientPub, "chan-a", SENDER_KEY, NONCE_SALT, 1);

    expect(() => voiceKeyUnwrap(RECIPIENT_SEED, senderPub, "chan-b", ciphertext, nonce)).toThrow();
  });
});

describe("voicePacketSeal / voicePacketOpen", () => {
  const opus = new TextEncoder().encode("opus-frame-vector");

  for (const name of ["voice_packet_ctr0", "voice_packet_ctr7"]) {
    it(`matches the fixed vector ${name} and opens it back`, () => {
      const v = vector(name);
      const key = hexToBytes(v.str("sender_key"));
      const salt = hexToBytes(v.str("nonce_salt"));
      const packet = voicePacketSeal(key, salt, v.num("key_id"), BigInt(v.num("counter")), v.num("timestamp"), hexToBytes(v.str("opus")));
      expect(bytesToHex(packet)).toBe(v.out("packet"));

      const opened = voicePacketOpen(key, salt, hexToBytes(v.out("packet")));
      expect(opened.keyId).toBe(v.num("key_id"));
      expect(opened.ctr).toBe(BigInt(v.num("counter")));
      expect(opened.ts).toBe(v.num("timestamp"));
      expect(bytesToHex(opened.opus)).toBe(v.str("opus"));
    });
  }

  it("throws when the header is tampered with", () => {
    const packet = voicePacketSeal(SENDER_KEY, NONCE_SALT, KEY_ID, 0n, 1000, opus);
    packet[0] ^= 0xff;
    expect(() => voicePacketOpen(SENDER_KEY, NONCE_SALT, packet)).toThrow();
  });

  it("rejects packets shorter than header + tag", () => {
    expect(() => voicePacketOpen(SENDER_KEY, NONCE_SALT, new Uint8Array(31))).toThrow();
  });

  it("round-trips ctr/ts/keyId/opus", () => {
    const packet = voicePacketSeal(SENDER_KEY, NONCE_SALT, 3, 42n, 9000, opus);
    const opened = voicePacketOpen(SENDER_KEY, NONCE_SALT, packet);
    expect(opened.keyId).toBe(3);
    expect(opened.ctr).toBe(42n);
    expect(opened.ts).toBe(9000);
    expect(bytesToHex(opened.opus)).toBe(bytesToHex(opus));
  });
});
