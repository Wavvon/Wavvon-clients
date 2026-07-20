import { describe, it, expect } from "vitest";
import {
  isSpawnerChannel,
  isTemporaryChannel,
  resolveOwnerDisplayName,
  normalizeSpawnerNameTemplate,
} from "../spawnerChannels";

describe("isSpawnerChannel (temp-voice-channels.md §5)", () => {
  it("is true only for channel_type 'spawner'", () => {
    expect(isSpawnerChannel({ channel_type: "spawner" })).toBe(true);
    expect(isSpawnerChannel({ channel_type: "text" })).toBe(false);
    expect(isSpawnerChannel({ channel_type: "banner" })).toBe(false);
    expect(isSpawnerChannel({ channel_type: undefined })).toBe(false);
  });
});

describe("isTemporaryChannel", () => {
  it("is true only when is_temporary is exactly true", () => {
    expect(isTemporaryChannel({ is_temporary: true })).toBe(true);
    expect(isTemporaryChannel({ is_temporary: false })).toBe(false);
    expect(isTemporaryChannel({ is_temporary: undefined })).toBe(false);
  });
});

describe("resolveOwnerDisplayName", () => {
  const users = [
    { public_key: "abc123", display_name: "Alice" },
    { public_key: "def456", display_name: null },
  ];

  it("returns null when there's no owner", () => {
    expect(resolveOwnerDisplayName(null, users)).toBeNull();
    expect(resolveOwnerDisplayName(undefined, users)).toBeNull();
  });

  it("returns the owner's display name when known", () => {
    expect(resolveOwnerDisplayName("abc123", users)).toBe("Alice");
  });

  it("falls back to a short pubkey when the owner has no display name", () => {
    expect(resolveOwnerDisplayName("def456", users)).toBe("def456");
  });

  it("falls back to a short pubkey when the owner isn't in the local user list", () => {
    expect(resolveOwnerDisplayName("0123456789abcdef", users)).toBe("0123456789ab");
  });
});

describe("normalizeSpawnerNameTemplate", () => {
  it("trims and passes through a non-blank template", () => {
    expect(normalizeSpawnerNameTemplate("  {user}'s den  ")).toBe("{user}'s den");
  });

  it("collapses blank input to undefined so the hub applies its own default", () => {
    expect(normalizeSpawnerNameTemplate("")).toBeUndefined();
    expect(normalizeSpawnerNameTemplate("   ")).toBeUndefined();
  });
});
