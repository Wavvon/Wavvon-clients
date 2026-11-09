import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "../hex";
import { dhKeySigningBytes, verifyDhKeyRecord } from "./crypto";

describe("verifyDhKeyRecord", () => {
  const owner = ed25519.utils.randomPrivateKey();
  const pubkey = bytesToHex(ed25519.getPublicKey(owner));
  const dh = "ab".repeat(32);
  const sig = bytesToHex(ed25519.sign(dhKeySigningBytes(pubkey, dh), owner));

  it("accepts a record its identity signed", () => {
    expect(verifyDhKeyRecord(pubkey, dh, sig)).toBe(true);
  });

  it("refuses a key the hub swapped in, or a signature by anyone else", () => {
    expect(verifyDhKeyRecord(pubkey, "cd".repeat(32), sig)).toBe(false);
    const hub = ed25519.utils.randomPrivateKey();
    const forged = bytesToHex(ed25519.sign(dhKeySigningBytes(pubkey, dh), hub));
    expect(verifyDhKeyRecord(pubkey, dh, forged)).toBe(false);
    expect(verifyDhKeyRecord(pubkey, dh, "zz")).toBe(false);
  });
});
