import { describe, expect, it } from "vitest";
import { expiredMutes, muteDeadline, withoutDeadlines } from "../muteExpiry";

describe("muteExpiry", () => {
  it("ends a timed mute at an absolute point", () => {
    const now = new Date(2026, 10, 17, 22, 30);
    expect(muteDeadline("15m", now)).toBe(now.getTime() + 15 * 60_000);
    expect(new Date(muteDeadline("tomorrow", now))).toEqual(new Date(2026, 10, 18, 8, 0));
  });

  it("splits passed deadlines from the next one ahead", () => {
    const d = { hubs: { a: 100, b: 300 }, channels: { a: { c: 50, d: 200 } } };
    const { expired, next } = expiredMutes(d, 150);
    expect(expired).toEqual({ hubs: ["a"], channels: [["a", "c"]] });
    expect(next).toBe(200);
    expect(withoutDeadlines(d, expired)).toEqual({ hubs: { b: 300 }, channels: { a: { d: 200 } } });
    expect(withoutDeadlines(d, { hubs: [], channels: [["a", "c"], ["a", "d"]] }).channels).toEqual({});
  });
});
