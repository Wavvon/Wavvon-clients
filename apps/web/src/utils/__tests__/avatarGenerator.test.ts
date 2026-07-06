import { describe, it, expect } from "vitest";
// Imported directly (bypassing the @wavvon/ui barrel) because that barrel
// also re-exports MessageContent, whose DOMPurify.addHook call at module
// scope requires a DOM global that isn't present under vitest's node
// environment.
import { generateAvatarDataUrl, randomAvatarSeed } from "../../../../../packages/ui/src/utils/avatarGenerator";

describe("generateAvatarDataUrl", () => {
  it("is deterministic for a given seed", () => {
    expect(generateAvatarDataUrl("hello")).toBe(generateAvatarDataUrl("hello"));
  });

  it("differs across seeds", () => {
    expect(generateAvatarDataUrl("hello")).not.toBe(generateAvatarDataUrl("world"));
  });

  it("returns a self-contained SVG data URL with no external references", () => {
    const url = generateAvatarDataUrl("seed-123");
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(url.split(",")[1], "base64").toString("utf-8");
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<image");
    expect(svg.toLowerCase()).not.toContain("dicebear");
  });
});

describe("randomAvatarSeed", () => {
  it("produces distinct values across calls", () => {
    const seeds = new Set(Array.from({ length: 20 }, () => randomAvatarSeed()));
    expect(seeds.size).toBe(20);
  });
});
