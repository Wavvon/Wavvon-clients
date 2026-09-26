import { describe, it, expect } from "vitest";
import {
  HANDOVER_VERSION,
  handoverDone,
  handoverOffer,
  handoverReady,
  isHandoverDone,
  isHandoverOffer,
  isHandoverReady,
  isSafeHubUrl,
} from "./handover";

const SEED = "a1".repeat(32);

// These guards are the trust boundary: what they accept, the receiver acts
// on. Every case below is something a hostile page can post.
describe("handover message guards", () => {
  it("accepts what the builders produce", () => {
    expect(isHandoverReady(handoverReady())).toBe(true);
    expect(isHandoverOffer(handoverOffer({ hub_url: "https://hub.example" }))).toBe(true);
    expect(isHandoverOffer(handoverOffer({ hub_url: "https://hub.example", seed_hex: SEED }))).toBe(true);
    expect(isHandoverDone(handoverDone(SEED))).toBe(true);
  });

  it("rejects another version, so a future shape cannot be half-read", () => {
    expect(isHandoverOffer({ ...handoverOffer({ hub_url: "https://hub.example" }), v: HANDOVER_VERSION + 1 })).toBe(false);
  });

  it("rejects a malformed seed outright rather than dropping the field", () => {
    // Dropping it would look like a successful join that quietly left the
    // identity behind.
    expect(isHandoverOffer({ ...handoverOffer({ hub_url: "https://hub.example" }), seed_hex: "nope" })).toBe(false);
    expect(isHandoverOffer({ ...handoverOffer({ hub_url: "https://hub.example" }), seed_hex: "a1".repeat(31) })).toBe(false);
  });

  it("rejects an invite code that could not be one", () => {
    expect(isHandoverOffer({ ...handoverOffer({ hub_url: "https://hub.example" }), invite_code: "a/../b" })).toBe(false);
    expect(isHandoverOffer({ ...handoverOffer({ hub_url: "https://hub.example" }), invite_code: "" })).toBe(false);
  });

  it("rejects junk that merely looks like a message", () => {
    expect(isHandoverOffer(null)).toBe(false);
    expect(isHandoverOffer("wavvon:handover-offer")).toBe(false);
    expect(isHandoverOffer({ v: 1, type: "wavvon:handover-offer" })).toBe(false);
    expect(isHandoverDone({ v: 1, type: "wavvon:handover-done", pubkey: "short" })).toBe(false);
  });
});

describe("isSafeHubUrl", () => {
  it("takes plain http and https origins", () => {
    expect(isSafeHubUrl("https://hub.example")).toBe(true);
    expect(isSafeHubUrl("https://hub.example:8443")).toBe(true);
    expect(isSafeHubUrl("http://localhost:3000")).toBe(true);
  });

  it("refuses schemes that are not a hub", () => {
    expect(isSafeHubUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHubUrl("data:text/html,x")).toBe(false);
    expect(isSafeHubUrl("file:///etc/passwd")).toBe(false);
  });

  it("refuses embedded credentials — the classic look-alike host", () => {
    expect(isSafeHubUrl("https://hub.example@evil.test")).toBe(false);
  });

  it("refuses a query or fragment, which a hub URL has no use for", () => {
    expect(isSafeHubUrl("https://hub.example/?x=1")).toBe(false);
    expect(isSafeHubUrl("https://hub.example/#x")).toBe(false);
  });

  it("refuses non-strings and absurd lengths", () => {
    expect(isSafeHubUrl(undefined)).toBe(false);
    expect(isSafeHubUrl(`https://hub.example/${"a".repeat(3000)}`)).toBe(false);
  });
});
