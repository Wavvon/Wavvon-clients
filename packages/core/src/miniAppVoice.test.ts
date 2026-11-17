import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkSetVoicePosition,
  createPositionCoalescer,
  isFromFrame,
  type VoiceBridgeState,
} from "./miniAppVoice";

const zone = { zone_id: "z1", coordinate_system: "2d" };
const inVoice: VoiceBridgeState = { inVoice: true, zones: [zone] };
const msg = (extra: object) => ({ type: "wavvon:setVoicePosition", v: 1, position: [40, 60], ...extra });

describe("isFromFrame", () => {
  const frame = {};
  it("needs the frame's own window and the app's origin", () => {
    expect(isFromFrame({ source: frame, origin: "https://app.example" }, frame, "https://app.example")).toBe(true);
    expect(isFromFrame({ source: {}, origin: "https://app.example" }, frame, "https://app.example")).toBe(false);
    expect(isFromFrame({ source: frame, origin: "https://evil.example" }, frame, "https://app.example")).toBe(false);
    expect(isFromFrame({ source: null, origin: "https://app.example" }, null, "https://app.example")).toBe(false);
  });
});

describe("checkSetVoicePosition", () => {
  it("accepts the only zone, or a named one", () => {
    expect(checkSetVoicePosition(msg({}), inVoice)).toEqual({ ok: true, zoneId: "z1", position: [40, 60] });
    expect(checkSetVoicePosition(msg({ zone_id: "z1" }), inVoice).ok).toBe(true);
  });
  it("refuses when the user is not in voice in the app's channel", () => {
    expect(checkSetVoicePosition(msg({}), { inVoice: false, zones: [zone] })).toEqual({ ok: false, reason: "not_in_voice" });
  });
  it("refuses a missing, unknown or ambiguous zone", () => {
    expect(checkSetVoicePosition(msg({}), { inVoice: true, zones: [] })).toEqual({ ok: false, reason: "no_zone" });
    expect(checkSetVoicePosition(msg({ zone_id: "nope" }), inVoice)).toEqual({ ok: false, reason: "no_zone" });
    const two = { inVoice: true, zones: [zone, { zone_id: "z2", coordinate_system: "2d" }] };
    expect(checkSetVoicePosition(msg({}), two)).toEqual({ ok: false, reason: "ambiguous_zone" });
    expect(checkSetVoicePosition(msg({ zone_id: "z2" }), two).ok).toBe(true);
  });
  it("refuses a position of the wrong shape", () => {
    for (const position of [[1], [1, 2, 3], [1, NaN], [1, Infinity], ["1", 2], "x", null]) {
      expect(checkSetVoicePosition(msg({ position }), inVoice)).toEqual({ ok: false, reason: "bad_position" });
    }
  });
  it("ignores any pubkey the frame names", () => {
    const r = checkSetVoicePosition(msg({ pubkey: "someone-else" }), inVoice);
    expect(r).toEqual({ ok: true, zoneId: "z1", position: [40, 60] });
  });
});

describe("createPositionCoalescer", () => {
  afterEach(() => vi.useRealTimers());

  it("sends the first at once, then at most one per 50 ms, latest wins, trailing sent", () => {
    vi.useFakeTimers();
    const sent: number[][] = [];
    const c = createPositionCoalescer((_z, p) => sent.push(p), 50, () => Date.now());
    c.push("z", [1, 1]);
    expect(sent).toEqual([[1, 1]]);
    c.push("z", [2, 2]);
    c.push("z", [3, 3]);
    vi.advanceTimersByTime(49);
    expect(sent).toEqual([[1, 1]]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([[1, 1], [3, 3]]);
    vi.advanceTimersByTime(500);
    expect(sent.length).toBe(2);
    c.push("z", [4, 4]);
    expect(sent.length).toBe(3);
  });

  it("cancel drops the pending send", () => {
    vi.useFakeTimers();
    const sent: number[][] = [];
    const c = createPositionCoalescer((_z, p) => sent.push(p), 50, () => Date.now());
    c.push("z", [1, 1]);
    c.push("z", [2, 2]);
    c.cancel();
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([[1, 1]]);
  });
});
