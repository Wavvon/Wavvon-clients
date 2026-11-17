import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  buildIdentityListing, identityDeleteMessage, normalizeListingLanguages, normalizeListingTags, signDirectoryMessage,
} from "./identityListing";
import { bytesToHex, hexToBytes } from "./hex";

const seed = "11".repeat(32);
const pub = bytesToHex(ed25519.getPublicKey(hexToBytes(seed)));

function fromB64url(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}

describe("identity listing", () => {
  it("builds a person listing routed to the home hub", () => {
    const doc = JSON.parse(buildIdentityListing(
      { name: " Ada ", tagline: "hi", tags: ["chess"], languages: ["it"] }, pub, "https://hub.example/", 7,
    ));
    expect(doc).toMatchObject({
      format: "wavvon.identity", version: 1, pubkey: `ed25519:${pub}`, name: "Ada", kind: "person",
      contact: { home_hub: "https://hub.example" }, listed_at: 7,
    });
  });

  it("signs what the directory verifies: the exact payload bytes, base64url", () => {
    const payload = buildIdentityListing({ name: "Ada", tagline: "", tags: [], languages: [] }, pub, "https://h", 1);
    const sig = signDirectoryMessage(payload, seed);
    expect(sig).not.toMatch(/[+/=]/);
    expect(ed25519.verify(fromB64url(sig), new TextEncoder().encode(payload), hexToBytes(pub))).toBe(true);
    expect(identityDeleteMessage(pub, 1)).toBe(`wavvon-directory/delete/v1:identity:${pub}:1`);
  });

  it("keeps only tags and languages the directory accepts", () => {
    expect(normalizeListingTags("Board Games, chess, chess, -bad")).toEqual(["board-games", "chess"]);
    expect(normalizeListingLanguages("it, en-GB, english")).toEqual(["it", "en-GB"]);
  });
});
