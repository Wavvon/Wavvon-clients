import { describe, it, expect } from "vitest";
import { PRF_SALT_LABEL, prfSaltBytes, prfOutputToSeedHex, PrfOutputError } from "./prf";
import { seedToPhrase, phraseToSeed } from "./recovery";
import { masterPublicKeyHex } from "./master";

describe("PRF_SALT_LABEL", () => {
  it("is the pinned wire-level protocol string", () => {
    // Must never change — see prf.ts. Pinning the literal here catches
    // accidental edits as a failing test rather than a silent identity break.
    expect(PRF_SALT_LABEL).toBe("wavvon-master/v1");
  });

  it("encodes to the expected UTF-8 byte length", () => {
    expect(prfSaltBytes()).toEqual(new TextEncoder().encode("wavvon-master/v1"));
    expect(prfSaltBytes().length).toBe(16);
  });
});

describe("prfOutputToSeedHex", () => {
  it("hex-encodes a valid 32-byte PRF output", () => {
    const output = Uint8Array.from({ length: 32 }, (_, i) => i + 1); // 0x01..0x20
    expect(prfOutputToSeedHex(output)).toBe(
      "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
    );
  });

  it.each([0, 16, 31, 33, 64])("rejects a %i-byte output", (len) => {
    expect(() => prfOutputToSeedHex(new Uint8Array(len))).toThrow(PrfOutputError);
  });
});

describe("fixed fake PRF output round-trip", () => {
  // A fake 32-byte PRF output (0x01..0x20) standing in for what an
  // authenticator would return. Everything downstream of prfOutputToSeedHex
  // is unchanged BIP39/HKDF machinery, so this proves the PRF path plugs
  // into it without any special-casing.
  const fakePrfOutput = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const MASTER_FROM_ENTROPY_PUB =
    "8fbafd0f662f225430eed18b132b3de956dc7d75c95b26baa97ada69aab51565";

  it("round-trips seedHex -> mnemonic -> seedHex", () => {
    const seedHex = prfOutputToSeedHex(fakePrfOutput);
    const phrase = seedToPhrase(seedHex);
    expect(phraseToSeed(phrase)).toBe(seedHex);
  });

  it("derives a stable master public key from the PRF-sourced seed", () => {
    const seedHex = prfOutputToSeedHex(fakePrfOutput);
    expect(masterPublicKeyHex(seedHex)).toBe(MASTER_FROM_ENTROPY_PUB);
  });
});
