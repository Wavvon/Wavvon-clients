import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "../hex";
import {
  hubRotationSigningBytes,
  verifyHubRotation,
  rotationAppliesTo,
  type HubKeyRotation,
} from "./hubRotation";

/**
 * The shared test vector: a payload `wavvon-hub rotate-key` actually
 * produced, captured from a throwaway hub identity.
 *
 * It has to come from the hub rather than from this file, because the point
 * of the test is that the two implementations agree on the signed bytes. A
 * fixture this file signs for itself would pass whatever either side did.
 */
const VECTOR: HubKeyRotation = {
  old_pubkey: "e07fcf4499e0942ff898c44b8d5ef69b8457b9ae95710480982fd3b36e56273b",
  new_pubkey: "b424187b0a928c90b1803b7200ed679ae1d8cfd90b86f21c21ab40e6bf3fbc13",
  effective_at: 1790449172,
  signature:
    "0e1dcbda4e65474f00e857cedb4d84b7f40b4361277127f2dfec5ef8794ba0f94f3c1fd9adf7e41bbd019f5c3c6029576c87875d960e24513a351aabaa27750e",
};

function sign(secret: Uint8Array, r: Omit<HubKeyRotation, "signature">): HubKeyRotation {
  const msg = hubRotationSigningBytes(r.old_pubkey, r.new_pubkey, r.effective_at);
  return { ...r, signature: bytesToHex(ed25519.sign(msg, secret)) };
}

describe("hubRotationSigningBytes", () => {
  it("is the hub's plain colon-joined triple", () => {
    expect(new TextDecoder().decode(hubRotationSigningBytes("aa", "bb", 7))).toBe("aa:bb:7");
  });
});

describe("verifyHubRotation", () => {
  it("accepts a payload the hub produced", () => {
    expect(verifyHubRotation(VECTOR)).toBe(true);
  });

  it("rejects it once a single field is moved", () => {
    expect(verifyHubRotation({ ...VECTOR, effective_at: VECTOR.effective_at + 1 })).toBe(false);
    expect(verifyHubRotation({ ...VECTOR, new_pubkey: VECTOR.old_pubkey })).toBe(false);
  });

  it("rejects a signature by the arriving key rather than the leaving one", () => {
    const secret = ed25519.utils.randomPrivateKey();
    const newPubkey = bytesToHex(ed25519.getPublicKey(secret));
    const forged = sign(secret, {
      old_pubkey: VECTOR.old_pubkey,
      new_pubkey: newPubkey,
      effective_at: 1790448306,
    });
    // Signed by the key that stands to gain, which is the whole point of
    // requiring the old one.
    expect(verifyHubRotation(forged)).toBe(false);
  });

  it("rejects garbage instead of throwing", () => {
    expect(verifyHubRotation({ ...VECTOR, signature: "not-hex" })).toBe(false);
    expect(verifyHubRotation({ ...VECTOR, old_pubkey: "" })).toBe(false);
  });
});

describe("rotationAppliesTo", () => {
  it("binds the endorsement to the key we already hold", () => {
    expect(rotationAppliesTo(VECTOR, VECTOR.old_pubkey)).toBe(true);
  });

  it("ignores a valid endorsement between two hubs that are not ours", () => {
    const secret = ed25519.utils.randomPrivateKey();
    const strangerOld = bytesToHex(ed25519.getPublicKey(secret));
    const valid = sign(secret, {
      old_pubkey: strangerOld,
      new_pubkey: VECTOR.new_pubkey,
      effective_at: 1790448306,
    });
    expect(verifyHubRotation(valid)).toBe(true);
    expect(rotationAppliesTo(valid, VECTOR.old_pubkey)).toBe(false);
  });

  it("is false when there is no endorsement at all", () => {
    expect(rotationAppliesTo(null, VECTOR.old_pubkey)).toBe(false);
    expect(rotationAppliesTo(undefined, VECTOR.old_pubkey)).toBe(false);
  });
});
