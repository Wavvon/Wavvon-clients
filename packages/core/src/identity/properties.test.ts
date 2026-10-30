// Properties over whole input domains, next to the fixed wire vectors: a
// vector proves one input encodes as the server does; these prove that every
// input signs, verifies and round-trips, and that changing it is noticed.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { bytesToHex } from "../hex";
import { buildPrefsBlob, buildSubkeyCert, subkeyCertSigningBytes, verifyPrefsBlob } from "./wire";
import { publicKeyHex, verifySubkeyCert } from "./crypto";
import { decryptBackup, encryptBackup } from "./backup";

const seed = fc.uint8Array({ minLength: 32, maxLength: 32 }).map(bytesToHex);
const label = fc.string({ unit: "grapheme", maxLength: 40 });
const hubs = fc.array(fc.webUrl(), { maxLength: 4 });
const time = fc.integer({ min: 0, max: 2 ** 40 });

describe("subkey cert", () => {
  it("verifies for any input, and not once a field changes", () => {
    fc.assert(
      fc.property(seed, seed, label, time, fc.option(time, { nil: null }), hubs, (master, sub, name, at, until, fallback) => {
        const cert = buildSubkeyCert(master, publicKeyHex(master), publicKeyHex(sub), name, at, until, fallback);
        expect(verifySubkeyCert(cert)).toBe(true);
        expect(verifySubkeyCert({ ...cert, device_label: `${name}x` })).toBe(false);
        expect(verifySubkeyCert({ ...cert, fallback_hubs: [...fallback, "https://extra.example"] })).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  // Length prefixes are what keep two different certs from signing the same
  // bytes: ["ab","c"] and ["a","bc"] must not collide.
  it("never encodes two different inputs to the same signing bytes", () => {
    const input = fc.tuple(label, hubs);
    fc.assert(
      fc.property(seed, input, input, (master, a, b) => {
        fc.pre(JSON.stringify(a) !== JSON.stringify(b));
        const m = publicKeyHex(master);
        const bytes = ([name, fb]: [string, string[]]) => bytesToHex(subkeyCertSigningBytes(m, m, name, 1, null, fb));
        expect(bytes(a)).not.toBe(bytes(b));
      }),
      { numRuns: 200 },
    );
  });
});

describe("prefs blob", () => {
  it("verifies for any ciphertext, and not once it changes", () => {
    fc.assert(
      fc.property(seed, fc.integer({ min: 0, max: 2 ** 31 }), fc.uint8Array({ minLength: 1, maxLength: 256 }), (master, version, ct) => {
        const blob = buildPrefsBlob(master, publicKeyHex(master), version, bytesToHex(ct));
        expect(verifyPrefsBlob(blob)).toBe(true);
        const flipped = ct.slice();
        flipped[0] ^= 1;
        expect(verifyPrefsBlob({ ...blob, ciphertext_hex: bytesToHex(flipped) })).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});

describe(".wavvon-backup", () => {
  // Argon2id at the real cost (64 MiB) makes each case slow, so few of them.
  it("restores any account with its passphrase, and nothing without it", async () => {
    await fc.assert(
      fc.asyncProperty(label, seed, fc.string({ minLength: 1, maxLength: 30 }), async (name, secret, pass) => {
        const envelope = await encryptBackup({ label: name, secret_key_hex: secret }, pass);
        const text = JSON.stringify(envelope);
        expect(await decryptBackup(text, pass)).toEqual({ label: name, secret_key_hex: secret });
        await expect(decryptBackup(text, `${pass}!`)).rejects.toThrow();
      }),
      { numRuns: 3 },
    );
  }, 120_000);
});
