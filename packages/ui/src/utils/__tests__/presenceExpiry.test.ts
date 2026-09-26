import { describe, it, expect } from "vitest";
import { resolveStoredPresence, storedPresenceFor } from "../presenceExpiry";

const NOW = 1_700_000_000_000;

describe("storedPresenceFor", () => {
  it("stores a deadline, not a duration", () => {
    expect(storedPresenceFor("away", 60, NOW)).toEqual({ status: "away", until: NOW + 3_600_000 });
  });

  it("gives online no deadline — reverting to online in an hour is not a thing", () => {
    expect(storedPresenceFor("online", 60, NOW)).toEqual({ status: "online" });
  });

  it("treats no duration and a nonsense one as indefinite", () => {
    expect(storedPresenceFor("dnd", null, NOW)).toEqual({ status: "dnd" });
    expect(storedPresenceFor("dnd", 0, NOW)).toEqual({ status: "dnd" });
    expect(storedPresenceFor("dnd", -5, NOW)).toEqual({ status: "dnd" });
  });
});

describe("resolveStoredPresence", () => {
  // The bug this exists for: "clear after" was a setTimeout and nothing else,
  // so it lived only as long as the page. Set Away for an hour, reload, and
  // you stayed Away until you noticed — the reload silently turned a timed
  // status into a permanent one.
  it("comes back online when the deadline has passed", () => {
    const raw = JSON.stringify({ status: "away", until: NOW - 1 });
    expect(resolveStoredPresence(raw, NOW)).toEqual({ status: "online", revertAfterMs: null });
  });

  it("comes back away with the remainder still counting", () => {
    const raw = JSON.stringify({ status: "away", until: NOW + 90_000 });
    expect(resolveStoredPresence(raw, NOW)).toEqual({ status: "away", revertAfterMs: 90_000 });
  });

  it("keeps an indefinite status indefinite", () => {
    const raw = JSON.stringify({ status: "dnd" });
    expect(resolveStoredPresence(raw, NOW)).toEqual({ status: "dnd", revertAfterMs: null });
  });

  // Online is the safe direction to fail in: the alternative is telling
  // everyone you are away when you are not.
  it("is online for nothing stored, junk, or an unknown status", () => {
    expect(resolveStoredPresence(null, NOW).status).toBe("online");
    expect(resolveStoredPresence("not json", NOW).status).toBe("online");
    expect(resolveStoredPresence(JSON.stringify({ status: "asleep" }), NOW).status).toBe("online");
    expect(resolveStoredPresence(JSON.stringify({ status: 7 }), NOW).status).toBe("online");
  });

  it("ignores a non-numeric deadline rather than reverting on it", () => {
    const raw = JSON.stringify({ status: "away", until: "soon" });
    expect(resolveStoredPresence(raw, NOW)).toEqual({ status: "away", revertAfterMs: null });
  });
});
