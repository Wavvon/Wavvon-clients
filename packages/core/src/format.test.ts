import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatRelativeSigned, isBirthdayToday } from "./format";

const NOW = 1_700_000_000;

describe("formatRelativeSigned", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a falsy timestamp", () => {
    expect(formatRelativeSigned(0)).toBeNull();
  });

  it("marks a past timestamp as not future and reports elapsed magnitude", () => {
    expect(formatRelativeSigned(NOW - 90)).toEqual({ future: false, duration: "1m" });
  });

  it("marks a future timestamp as future and reports remaining magnitude", () => {
    expect(formatRelativeSigned(NOW + 86400)).toEqual({ future: true, duration: "1d" });
  });

  it("handles a future timestamp under a minute away", () => {
    expect(formatRelativeSigned(NOW + 45)).toEqual({ future: true, duration: "45s" });
  });

  it("handles a future timestamp about a day away, matching the reported bug", () => {
    // ~24h invite expiry reported as "-85797s ago" before the fix.
    expect(formatRelativeSigned(NOW + 85797)).toEqual({ future: true, duration: "23h" });
  });
});

describe("isBirthdayToday", () => {
  const jun15 = new Date(2026, 5, 15);

  it("matches an MM-DD equal to today, regardless of year", () => {
    expect(isBirthdayToday("06-15", jun15)).toBe(true);
  });

  it("does not match a different day", () => {
    expect(isBirthdayToday("06-16", jun15)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isBirthdayToday(null, jun15)).toBe(false);
    expect(isBirthdayToday(undefined, jun15)).toBe(false);
  });
});
