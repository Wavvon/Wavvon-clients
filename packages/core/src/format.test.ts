import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatDayLabel,
  formatRelative,
  formatDate,
  formatTime,
  formatDateTime,
  formatRelativeSigned,
  isBirthdayToday,
  setFormatLocale,
} from "./format";

// Every expectation below is locale-dependent now that these go through Intl,
// and the default is the runtime locale — which on a developer machine is
// whatever that machine is set to and in CI is en. Pin it per block.
beforeEach(() => setFormatLocale("en"));
afterEach(() => setFormatLocale(undefined));

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

// The point of the change: these used to be English string literals in an app
// that ships four locales, so an Italian admin reading the invite list got
// English durations. One case per locale, and the English column is
// character-for-character what the literals produced.
describe("locale-aware durations and day labels", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });
  afterEach(() => {
    vi.useRealTimers();
    setFormatLocale(undefined);
  });

  it("renders the English output the hardcoded version produced", () => {
    setFormatLocale("en");
    expect(formatRelative(NOW - 45)).toBe("45s ago");
    expect(formatRelative(NOW - 300)).toBe("5m ago");
    expect(formatRelative(NOW - 7200)).toBe("2h ago");
    expect(formatRelative(NOW - 259200)).toBe("3d ago");
    expect(formatDayLabel(NOW)).toBe("Today");
    expect(formatDayLabel(NOW - 86400)).toBe("Yesterday");
  });

  it("follows the chosen language, not the English literal", () => {
    setFormatLocale("it");
    expect(formatRelative(NOW - 300)).toBe("5 min fa");
    expect(formatDayLabel(NOW)).toBe("Oggi");
    expect(formatDayLabel(NOW - 86400)).toBe("Ieri");

    setFormatLocale("de");
    expect(formatDayLabel(NOW)).toBe("Heute");
    expect(formatRelative(NOW - 7200)).toBe("vor 2 Std.");

    setFormatLocale("es");
    expect(formatDayLabel(NOW - 86400)).toBe("Ayer");
  });

  it("says which way a future timestamp points instead of clamping it", () => {
    setFormatLocale("en");
    // Before Intl this printed the bare negative offset "-85797s ago".
    expect(formatRelative(NOW + 85797)).toBe("in 23h");
  });

  it("formats the unsigned magnitude in the chosen language", () => {
    setFormatLocale("it");
    // Singular "1g", plural "3gg" — which is the whole reason not to append a
    // hardcoded unit letter.
    expect(formatRelativeSigned(NOW + 86400)).toEqual({ future: true, duration: "1g" });
    expect(formatRelativeSigned(NOW + 259200)).toEqual({ future: true, duration: "3gg" });
    setFormatLocale("en");
    expect(formatRelativeSigned(NOW + 86400)).toEqual({ future: true, duration: "1d" });
  });
});

describe("formatDate / formatTime follow the app language", () => {
  afterEach(() => setFormatLocale(undefined));
  const when = Date.UTC(2026, 9, 6, 12, 0) / 1000;
  const opts = { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" } as const;

  it("renders the same instant in each language", () => {
    setFormatLocale("en");
    expect(formatDate(when, opts)).toBe("Tue, Oct 6");
    setFormatLocale("it");
    expect(formatDate(when, opts)).toBe("mar 6 ott");
    setFormatLocale("de");
    expect(formatDate(when, opts)).toBe("Di., 6. Okt.");
    setFormatLocale("es");
    expect(formatDate(when, opts)).toBe("mar, 6 oct");
  });

  it("accepts a Date and formats time of day", () => {
    setFormatLocale("en");
    expect(formatTime(new Date(when * 1000), { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe("12:00");
    expect(formatDateTime(when, { timeZone: "UTC", dateStyle: "short", timeStyle: "short" })).toContain("12:00");
  });
});
