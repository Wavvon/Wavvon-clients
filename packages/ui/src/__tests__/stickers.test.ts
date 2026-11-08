import { describe, it, expect } from "vitest";
import {
  stickerErrorKey,
  parseHubError,
  savedEntryFor,
  savedStickerSrc,
  needsExternal,
  withSaved,
  withoutSaved,
  safeOriginHref,
} from "../utils/stickers";
import type { Sticker } from "../types";

const base: Sticker = {
  id: "s1", name: "wave", url: "/stickers/ab", sha256: "ab".repeat(32), width: 64, height: 64,
  origin_hub_url: null, origin_hub_name: null, state: "ok",
};

describe("stickerErrorKey", () => {
  it("reads a web HubApiError by status", () => {
    expect(stickerErrorKey({ status: 502, message: "origin_hash_mismatch" })).toBe("stickers.error.unavailable");
  });

  it("reads the desktop '<status>:<body>' shape", () => {
    expect(stickerErrorKey("409:pack_full", "manage")).toBe("stickers.error.pack_full");
    expect(stickerErrorKey("409:packs_full", "manage")).toBe("stickers.error.packs_full");
    expect(stickerErrorKey("409:too_many_packs", "manage")).toBe("stickers.error.too_many_packs");
    expect(stickerErrorKey("409:already_in_a_pack", "manage")).toBe("stickers.error.already_in_a_pack");
  });

  it("tells a block and a removal apart from a missing permission", () => {
    expect(stickerErrorKey("403:sticker_blocked")).toBe("stickers.error.blocked");
    expect(stickerErrorKey("403:sticker_removed")).toBe("stickers.error.removed");
    expect(stickerErrorKey("403:Missing permission: stickers.external", "send")).toBe("stickers.error.external_only");
    expect(stickerErrorKey("403:Missing permission", "manage")).toBe("stickers.error.forbidden");
  });

  it("separates removed from evicted on a 410", () => {
    expect(stickerErrorKey("410:sticker_removed")).toBe("stickers.error.removed");
    expect(stickerErrorKey("410:sticker_evicted")).toBe("stickers.error.evicted");
  });

  it("never turns a request with no answer into a definitive one", () => {
    expect(parseHubError(new Error("Failed: connection refused")).status).toBeNull();
    expect(stickerErrorKey(new Error("Failed: connection refused"))).toBe("stickers.error.network");
  });

  it("maps oversize and rate limiting", () => {
    expect(stickerErrorKey("413:origin_file_too_large")).toBe("stickers.error.too_large");
    expect(stickerErrorKey("429:slow down")).toBe("stickers.error.rate_limited");
  });
});

describe("collection helpers", () => {
  it("saves a sticker with its verified origin, or this hub when it has none", () => {
    const hub = { url: "https://here.example", name: "Here" };
    expect(savedEntryFor(base, hub, 5)).toEqual({
      sha256: base.sha256, name: "wave", origin_hub_url: "https://here.example", origin_hub_name: "Here", saved_at: 5,
    });
    const copy = { ...base, origin_hub_url: "https://a.example", origin_hub_name: "A" };
    expect(savedEntryFor(copy, hub, 5).origin_hub_url).toBe("https://a.example");
  });

  it("does not save the same hash twice, and removes by hash", () => {
    const e = savedEntryFor(base, { url: "https://h", name: "H" }, 1);
    const once = withSaved([], e);
    expect(withSaved(once, e)).toHaveLength(1);
    expect(withoutSaved(once, e.sha256)).toEqual([]);
  });

  it("needs stickers.external only for another hub's sticker", () => {
    const e = savedEntryFor(base, { url: "https://h/", name: "H" }, 1);
    expect(needsExternal(e, "https://h")).toBe(false);
    expect(needsExternal(e, "https://other")).toBe(true);
  });
});

describe("safeOriginHref", () => {
  it("links only http(s)", () => {
    expect(safeOriginHref("https://a.example")).toBe("https://a.example/");
    expect(safeOriginHref("javascript:alert(1)")).toBeNull();
    expect(safeOriginHref(null)).toBeNull();
  });
});

describe("savedStickerSrc", () => {
  const entry = { sha256: "ab", name: "wave", origin_hub_url: "https://a.example", origin_hub_name: "A", saved_at: 1 };
  it("loads from the origin only when the user joined it", () => {
    expect(savedStickerSrc(entry, "https://here.example", ["https://a.example/"])).toBe("https://a.example/stickers/ab");
  });
  it("asks the current hub for an origin the user never joined", () => {
    expect(savedStickerSrc({ ...entry, origin_hub_url: "https://tracker.example" }, "https://here.example", ["https://a.example"]))
      .toBe("https://here.example/stickers/ab");
  });
});
