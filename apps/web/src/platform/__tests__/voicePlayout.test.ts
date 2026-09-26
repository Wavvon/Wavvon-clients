import { describe, it, expect } from "vitest";
import {
  MAX_PLAYOUT_QUEUE,
  PLAYOUT_LEAD,
  nextPlayoutStart,
} from "../voicePlayout";

const FRAME = 960 / 48000; // 20 ms

describe("nextPlayoutStart", () => {
  it("holds the first frame a lead ahead of the clock, not at it", () => {
    // start() at `now` is what caused the overlap: a frame arriving a moment
    // late had nowhere to go but on top of the previous one.
    expect(nextPlayoutStart(undefined, 10)).toBeCloseTo(10 + PLAYOUT_LEAD, 6);
  });

  it("schedules a steady stream back to back, with no gaps", () => {
    let now = 10;
    let end: number | undefined;
    const starts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const at = nextPlayoutStart(end, now);
      starts.push(at);
      end = at + FRAME;
      now += FRAME; // frames arriving perfectly on time
    }
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeCloseTo(FRAME, 6);
    }
  });

  it("keeps a late frame in its slot instead of leaving silence", () => {
    // The frame is 15 ms late but the lead still covers it, so it plays where
    // the previous one ended — the listener hears continuous audio.
    const prevEnd = 10.1;
    const at = nextPlayoutStart(prevEnd, 10.095);
    expect(at).toBeCloseTo(prevEnd, 6);
  });

  it("keeps two frames arriving together in sequence, not on top of each other", () => {
    const now = 10;
    const first = nextPlayoutStart(undefined, now);
    const second = nextPlayoutStart(first + FRAME, now); // same instant
    expect(second).toBeCloseTo(first + FRAME, 6);
    expect(second).toBeGreaterThan(first);
  });

  it("restarts the clock after a real gap rather than scheduling in the past", () => {
    // Sender was silent for a second; the stored end time is long gone.
    const at = nextPlayoutStart(10.02, 11);
    expect(at).toBeCloseTo(11 + PLAYOUT_LEAD, 6);
    expect(at).toBeGreaterThan(11);
  });

  it("never returns a time in the past", () => {
    for (const prevEnd of [undefined, 0, 5, 9.999, 10, 10.5, 99]) {
      expect(nextPlayoutStart(prevEnd, 10)).toBeGreaterThanOrEqual(10);
    }
  });

  it("caps a runaway queue so latency cannot climb forever", () => {
    const now = 10;
    const tooFar = now + MAX_PLAYOUT_QUEUE + 0.05;
    const at = nextPlayoutStart(tooFar, now);
    expect(at).toBeCloseTo(now + PLAYOUT_LEAD, 6);
    expect(at).toBeLessThan(tooFar);
  });

  it("does not cap a queue that is merely full but within bounds", () => {
    const now = 10;
    const atLimit = now + MAX_PLAYOUT_QUEUE - 0.001;
    expect(nextPlayoutStart(atLimit, now)).toBeCloseTo(atLimit, 6);
  });

  it("keeps the lead below the cap, or the cap would fire on every frame", () => {
    expect(PLAYOUT_LEAD).toBeLessThan(MAX_PLAYOUT_QUEUE);
  });
});
