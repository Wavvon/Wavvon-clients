// The ECIES wrap behind pairing, pinned to the server's vector with the
// ephemeral key and nonce fixed (wire-vectors/wire-vectors.json).
import { describe, it, expect } from "vitest";
import { bytesToHex, hexToBytes } from "../hex";
import { unwrapBlobKey, wrapBlobKeyWith } from "./ecies";
import { fixture, vector } from "./wireVectors";

describe("ECIES wrap wire vector", () => {
  const v = vector("ecies_wrap");

  it("reproduces the canonical wrapped bytes", () => {
    const wrapped = wrapBlobKeyWith(
      hexToBytes(v.str("blob_key")),
      v.str("recipient_pubkey"),
      hexToBytes(v.str("eph_secret")),
      hexToBytes(v.str("nonce")),
    );
    expect(wrapped).toBe(v.out("wrapped"));
  });

  it("unwraps with the recipient's seed", () => {
    expect(bytesToHex(unwrapBlobKey(v.out("wrapped"), fixture("subkey_seed")))).toBe(v.str("blob_key"));
  });
});
