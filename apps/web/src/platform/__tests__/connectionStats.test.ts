import { describe, it, expect } from "vitest";
import {
  RTT_WINDOW,
  lossPercent,
  pushSample,
  rttStats,
  trackPacket,
  type LossTracker,
} from "../connectionStats";

describe("rttStats", () => {
  it("reports nothing before the first reply", () => {
    expect(rttStats([])).toEqual({ rttMs: null, jitterMs: null, samples: 0 });
  });

  it("reports a latency but no spread from a single sample", () => {
    // One probe cannot deviate from itself; claiming "± 0" would look measured.
    expect(rttStats([24])).toEqual({ rttMs: 24, jitterMs: null, samples: 1 });
  });

  it("uses the median, so one stalled probe does not move the headline", () => {
    // A 2-second outlier among steady 24 ms samples. A mean would read 420 ms.
    const s = rttStats([24, 25, 24, 26, 2000]);
    expect(s.rttMs).toBe(25);
  });

  it("reports the spread of a steady link as near zero", () => {
    const s = rttStats([24, 24, 24, 24]);
    expect(s.rttMs).toBe(24);
    expect(s.jitterMs).toBe(0);
  });

  it("reports a real spread on a jittery link", () => {
    const s = rttStats([20, 30, 20, 30]);
    expect(s.rttMs).toBe(25);
    expect(s.jitterMs).toBe(5);
  });

  it("averages the two middle samples on an even count", () => {
    expect(rttStats([10, 20]).rttMs).toBe(15);
  });

  it("ignores impossible samples rather than rendering NaN", () => {
    const s = rttStats([24, Number.NaN, -1, 26, Number.POSITIVE_INFINITY]);
    expect(s.samples).toBe(2);
    expect(s.rttMs).toBe(25);
  });
});

describe("pushSample", () => {
  it("keeps the window at its size, dropping the oldest", () => {
    let w: number[] = [];
    for (let i = 1; i <= RTT_WINDOW + 5; i++) w = pushSample(w, i);
    expect(w.length).toBe(RTT_WINDOW);
    expect(w[0]).toBe(6);
    expect(w[w.length - 1]).toBe(RTT_WINDOW + 5);
  });

  it("does not mutate the window it was given", () => {
    const w = [1, 2];
    pushSample(w, 3);
    expect(w).toEqual([1, 2]);
  });
});

describe("trackPacket / lossPercent", () => {
  function feed(ctrs: bigint[]): LossTracker | undefined {
    let t: LossTracker | undefined;
    for (const c of ctrs) t = trackPacket(t, c);
    return t;
  }

  it("reports nothing from a single packet — a span of one proves nothing", () => {
    expect(lossPercent(feed([5n]))).toBeNull();
    expect(lossPercent(undefined)).toBeNull();
  });

  it("reports zero on an unbroken run", () => {
    expect(lossPercent(feed([1n, 2n, 3n, 4n, 5n]))).toBe(0);
  });

  it("counts a gap as loss", () => {
    // 1..10 expected, 8 arrived: 2 lost of 10.
    expect(lossPercent(feed([1n, 2n, 3n, 4n, 5n, 6n, 9n, 10n]))).toBe(20);
  });

  it("does not read reordering as loss", () => {
    // Same five packets, shuffled. QUIC datagrams reorder routinely, and
    // treating that as loss would show a permanent fake percentage.
    expect(lossPercent(feed([3n, 1n, 5n, 2n, 4n]))).toBe(0);
  });

  it("never lets a late packet move the highest mark backwards", () => {
    const t = feed([10n, 11n, 4n]);
    expect(t?.highestCtr).toBe(11n);
    expect(t?.firstCtr).toBe(4n);
  });

  it("does not report loss for a sender who is simply silent", () => {
    // Two packets far apart in time but adjacent in counter: silence between
    // them is not loss, which is why expected comes from the counter span and
    // not from elapsed time.
    expect(lossPercent(feed([100n, 101n]))).toBe(0);
  });

  it("handles counters far beyond 32 bits, since ctr is 8 bytes", () => {
    const big = 9_007_199_254_740_993n; // past Number.MAX_SAFE_INTEGER
    expect(lossPercent(feed([big, big + 1n, big + 3n]))).toBe(25);
  });
});
