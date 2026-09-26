import { describe, it, expect } from "vitest";
import {
  addTrustRoot,
  isTrustedIssuer,
  normalizePubkey,
  parseTrustRoots,
  removeTrustRoot,
  serializeTrustRoots,
} from "../trustRoots";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("parseTrustRoots", () => {
  it("round-trips what it serialized", () => {
    const roots = [{ pubkey: A, label: "Hub A" }, { pubkey: B }];
    expect(parseTrustRoots(serializeTrustRoots(roots))).toEqual(roots);
  });

  it("survives anything a synced blob can hand it", () => {
    // The value is user-editable state that travels between devices, so a
    // malformed entry must cost that entry and not the whole list — losing
    // every root silently downgrades every badge to "unknown issuer".
    for (const raw of [null, undefined, "", "not json", "{}", "42", '["nope"]']) {
      expect(parseTrustRoots(raw)).toEqual([]);
    }
    expect(parseTrustRoots(JSON.stringify([{ pubkey: A }, { nope: 1 }, "junk", { pubkey: B }])))
      .toEqual([{ pubkey: A }, { pubkey: B }]);
  });

  it("keeps one entry per issuer", () => {
    const parsed = parseTrustRoots(JSON.stringify([{ pubkey: A }, { pubkey: A, label: "again" }]));
    expect(parsed).toEqual([{ pubkey: A }]);
  });

  it("accepts a bare pubkey string, which is what a hand-edited blob looks like", () => {
    expect(parseTrustRoots(JSON.stringify([A]))).toEqual([{ pubkey: A }]);
  });
});

describe("normalizePubkey", () => {
  it("takes a pasted key with stray whitespace or capitals", () => {
    expect(normalizePubkey(`  ${A.toUpperCase()} `)).toBe(A);
  });

  it("refuses anything that is not a hub key", () => {
    // Stored as-is, these would match nothing forever, and trusting an issuer
    // would appear to do nothing at all.
    for (const bad of ["", "0x" + A, A.slice(0, 63), A + "a", "zz".repeat(32), 42, null]) {
      expect(normalizePubkey(bad)).toBeNull();
    }
  });
});

describe("addTrustRoot / removeTrustRoot", () => {
  it("adds once and updates the label rather than duplicating", () => {
    let roots = addTrustRoot([], A, "First");
    roots = addTrustRoot(roots, A.toUpperCase(), "Second");
    expect(roots).toEqual([{ pubkey: A, label: "Second" }]);
  });

  it("ignores a key it could never match", () => {
    expect(addTrustRoot([], "not-a-key", "x")).toEqual([]);
  });

  it("removes by any casing", () => {
    const roots = addTrustRoot([], A);
    expect(removeTrustRoot(roots, A.toUpperCase())).toEqual([]);
  });
});

describe("isTrustedIssuer", () => {
  it("believes an explicit root and a hub you are on", () => {
    expect(isTrustedIssuer(A, [{ pubkey: A }])).toBe(true);
    expect(isTrustedIssuer(B, [], [B])).toBe(true);
  });

  it("believes nobody else — trust is not transitive", () => {
    // A root vouches for what it signed, never for whom it trusts.
    expect(isTrustedIssuer(B, [{ pubkey: A }], [A])).toBe(false);
    expect(isTrustedIssuer(null, [{ pubkey: A }])).toBe(false);
    expect(isTrustedIssuer("", [{ pubkey: A }])).toBe(false);
  });

  it("starts empty: there is no blessed root", () => {
    expect(isTrustedIssuer(A, [])).toBe(false);
  });
});
