import { describe, it, expect } from "vitest";
import { FRAME_SAMPLES, FrameAccumulator, FrameTracker, LATE_FRAME_MS, type CaptureFrame } from "../captureFraming";

function feed(acc: FrameAccumulator, blocks: number, startAt = 0, value = 1): CaptureFrame[] {
  const out: CaptureFrame[] = [];
  for (let i = 0; i < blocks; i++) {
    acc.push(new Float32Array(128).fill(value), startAt + i * 128, 0, (f) => out.push(f));
  }
  return out;
}

describe("FrameAccumulator", () => {
  it("emits one 960-sample frame per 7.5 render blocks, stamped with its first sample", () => {
    const frames = feed(new FrameAccumulator(), 15);
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => f.startFrame)).toEqual([0, FRAME_SAMPLES]);
    expect(frames.every((f) => f.samples.length === FRAME_SAMPLES)).toBe(true);
  });

  it("keeps sample order across the block that straddles a frame boundary", () => {
    const acc = new FrameAccumulator();
    const out: CaptureFrame[] = [];
    for (let i = 0; i < 8; i++) {
      const block = Float32Array.from({ length: 128 }, (_, j) => i * 128 + j);
      acc.push(block, i * 128, 0, (f) => out.push(f));
    }
    expect(Array.from(out[0].samples.subarray(950, 960))).toEqual([950, 951, 952, 953, 954, 955, 956, 957, 958, 959]);
  });

  it("discards a half-filled frame when the timeline jumps instead of splicing across the hole", () => {
    const acc = new FrameAccumulator();
    const out: CaptureFrame[] = [];
    feed(acc, 3);
    const f = feed(acc, 8, 10_000, 2);
    out.push(...f);
    expect(out).toHaveLength(1);
    expect(out[0].startFrame).toBe(10_000);
    expect(out[0].samples.every((v) => v === 2)).toBe(true);
  });
});

describe("FrameTracker", () => {
  it("counts nothing for a contiguous, prompt stream", () => {
    const t = new FrameTracker();
    for (let i = 0; i < 5; i++) t.observe(i * FRAME_SAMPLES, 100 * i, 100 * i + 3);
    expect(t.snapshot()).toEqual({ processed: 5, dropped: 0, late: 0, maxTransitMs: 3 });
  });

  it("counts frames missing from the stamp sequence as dropped", () => {
    const t = new FrameTracker();
    t.observe(0, 0, 1);
    t.observe(4 * FRAME_SAMPLES, 80, 81);
    expect(t.snapshot().dropped).toBe(3);
  });

  it("counts frames that waited longer than the threshold as late", () => {
    const t = new FrameTracker();
    t.observe(0, 0, LATE_FRAME_MS);
    t.observe(FRAME_SAMPLES, 20, 20 + LATE_FRAME_MS + 1);
    expect(t.snapshot()).toMatchObject({ late: 1, maxTransitMs: LATE_FRAME_MS + 1 });
  });
});
