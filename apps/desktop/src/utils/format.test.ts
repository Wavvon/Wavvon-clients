import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatPubkey,
  meAction,
  mentionsName,
  colorForKey,
  dayKey,
  formatRelative,
} from "@wavvon/core";

describe("formatPubkey", () => {
  it("returns empty string for null", () => {
    expect(formatPubkey(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatPubkey(undefined)).toBe("");
  });

  it("returns short key unchanged", () => {
    expect(formatPubkey("abcd1234")).toBe("abcd1234");
  });

  it("formats a full 64-char hex pubkey", () => {
    const key = "a".repeat(64);
    const result = formatPubkey(key);
    expect(result).toContain("…");
    expect(result).toContain("aaaa");
    expect(result).toMatch(/^[a-z]+-[a-z]+-[a-z]+…[a-z]+$/);
  });

  it("groups first 12 chars into 4-char segments separated by dashes", () => {
    const key = "abcdefghijkl" + "x".repeat(52);
    const result = formatPubkey(key);
    expect(result.startsWith("abcd-efgh-ijkl")).toBe(true);
  });

  it("ends with last 4 chars of the key", () => {
    const key = "a".repeat(60) + "zzzz";
    expect(formatPubkey(key).endsWith("zzzz")).toBe(true);
  });
});

describe("meAction", () => {
  it("returns null for a regular message", () => {
    expect(meAction("hello world")).toBeNull();
  });

  it("returns the action text for /me messages", () => {
    expect(meAction("/me waves")).toBe("waves");
  });

  it("returns null when /me has no trailing text", () => {
    expect(meAction("/me ")).toBeNull();
  });

  it("returns null when /me is not at the start", () => {
    expect(meAction("say /me hello")).toBeNull();
  });

  it("returns multi-word action", () => {
    expect(meAction("/me throws a fireball at the dragon")).toBe(
      "throws a fireball at the dragon"
    );
  });
});

describe("mentionsName", () => {
  it("returns false when name is null", () => {
    expect(mentionsName("hello @alice", null)).toBe(false);
  });

  it("detects an exact @mention", () => {
    expect(mentionsName("hey @alice how are you", "alice")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(mentionsName("hello @Alice", "alice")).toBe(true);
    expect(mentionsName("hello @alice", "Alice")).toBe(true);
  });

  it("returns false when the name is not mentioned", () => {
    expect(mentionsName("hello @bob", "alice")).toBe(false);
  });

  it("does not match partial mentions", () => {
    expect(mentionsName("hello @alicex", "alice")).toBe(false);
  });

  it("detects mention among multiple mentions", () => {
    expect(mentionsName("@bob and @alice are here", "alice")).toBe(true);
  });
});

describe("colorForKey", () => {
  it("returns the CSS accent variable for null", () => {
    expect(colorForKey(null)).toBe("var(--accent)");
  });

  it("returns the CSS accent variable for undefined", () => {
    expect(colorForKey(undefined)).toBe("var(--accent)");
  });

  it("returns an hsl color for a non-empty key", () => {
    const color = colorForKey("abc123");
    expect(color).toMatch(/^hsl\(\d+, 55%, 65%\)$/);
  });

  it("returns different colors for different keys", () => {
    const c1 = colorForKey("key1");
    const c2 = colorForKey("key2");
    expect(c1).not.toBe(c2);
  });

  it("returns the same color for the same key (deterministic)", () => {
    expect(colorForKey("somekey")).toBe(colorForKey("somekey"));
  });

  it("hue is within 0-359 range", () => {
    for (const key of ["aaaa", "bbbb", "cccc", "ffff"]) {
      const match = colorForKey(key).match(/^hsl\((\d+)/);
      const hue = Number(match![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe("dayKey", () => {
  it("returns yyyy-mm-dd format", () => {
    // Jan 5, 2024 UTC — use a noon timestamp to avoid timezone edge cases
    const ts = new Date("2024-01-05T12:00:00").getTime() / 1000;
    const key = dayKey(ts);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("pads month and day with leading zeros", () => {
    const ts = new Date("2024-03-04T12:00:00").getTime() / 1000;
    const key = dayKey(ts);
    expect(key).toContain("-03-04");
  });
});

describe("formatRelative", () => {
  const NOW = 1_700_000_000;

  beforeEach(() => {
    vi.setSystemTime(NOW * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns '—' for zero", () => {
    expect(formatRelative(0)).toBe("—");
  });

  it("returns seconds for recent timestamps", () => {
    expect(formatRelative(NOW - 30)).toBe("30s ago");
  });

  it("returns minutes for timestamps 1-59 minutes ago", () => {
    expect(formatRelative(NOW - 90)).toBe("1m ago");
    expect(formatRelative(NOW - 3500)).toBe("58m ago");
  });

  it("returns hours for timestamps 1-23 hours ago", () => {
    expect(formatRelative(NOW - 3600)).toBe("1h ago");
    expect(formatRelative(NOW - 7200)).toBe("2h ago");
  });

  it("returns days for timestamps 1+ days ago", () => {
    expect(formatRelative(NOW - 86400)).toBe("1d ago");
    expect(formatRelative(NOW - 172800)).toBe("2d ago");
  });
});
