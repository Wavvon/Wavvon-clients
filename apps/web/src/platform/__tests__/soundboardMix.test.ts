import { describe, it, expect } from "vitest";
import { mixClipIntoFrame, downmixChannels } from "../voice";
import type { ActiveClip } from "../voice";

// Float32Array truncates to 32-bit precision, so expected literals must go
// through the same truncation before comparing with toEqual.
function f32(values: number[]): number[] {
  return Array.from(new Float32Array(values));
}

function expectCloseArray(actual: ArrayLike<number>, expected: number[]) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 5);
  }
}

describe("mixClipIntoFrame", () => {
  it("passes the mic signal through unchanged when there is no active clip", () => {
    const mic = new Float32Array([0.1, -0.2, 0.3]);
    const { output, nextClip } = mixClipIntoFrame(mic, null);
    expect(Array.from(output)).toEqual(f32([0.1, -0.2, 0.3]));
    expect(nextClip).toBeNull();
  });

  it("sample-adds the clip on top of a silent mic frame", () => {
    const mic = new Float32Array([0, 0, 0]);
    const clip: ActiveClip = { samples: new Float32Array([0.2, 0.4, 0.6]), pos: 0 };
    const { output, nextClip } = mixClipIntoFrame(mic, clip);
    expectCloseArray(output, [0.2, 0.4, 0.6]);
    expect(nextClip).toBeNull();
  });

  it("clamps the sum instead of letting it wrap or exceed the valid PCM range", () => {
    const mic = new Float32Array([1, -1, 0.9]);
    const clip: ActiveClip = { samples: new Float32Array([1, -1, 0.5]), pos: 0 };
    const { output } = mixClipIntoFrame(mic, clip);
    expect(output[0]).toBe(1);
    expect(output[1]).toBe(-1);
    expect(output[2]).toBeCloseTo(1, 5);
  });

  it("advances the clip cursor and carries it over into the next frame", () => {
    const clip: ActiveClip = { samples: new Float32Array([0.1, 0.2, 0.3, 0.4]), pos: 0 };
    const frame1 = mixClipIntoFrame(new Float32Array([0, 0]), clip);
    expectCloseArray(frame1.output, [0.1, 0.2]);
    expect(frame1.nextClip).toEqual({ samples: clip.samples, pos: 2 });

    const frame2 = mixClipIntoFrame(new Float32Array([0, 0]), frame1.nextClip);
    expectCloseArray(frame2.output, [0.3, 0.4]);
    expect(frame2.nextClip).toBeNull();
  });

  it("stops mixing once the clip is exhausted mid-frame, leaving the rest as pure mic", () => {
    const clip: ActiveClip = { samples: new Float32Array([0.5]), pos: 0 };
    const mic = new Float32Array([0.1, 0.2, 0.3]);
    const { output, nextClip } = mixClipIntoFrame(mic, clip);
    expectCloseArray(output, [0.6, 0.2, 0.3]);
    expect(nextClip).toBeNull();
  });
});

describe("downmixChannels", () => {
  it("returns an empty buffer for zero channels", () => {
    expect(downmixChannels([]).length).toBe(0);
  });

  it("passes a mono buffer through unchanged", () => {
    const mono = new Float32Array([0.1, 0.2, 0.3]);
    expect(downmixChannels([mono])).toBe(mono);
  });

  it("averages stereo channels down to mono", () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 1, -1]);
    const out = downmixChannels([left, right]);
    expectCloseArray(out, [0.5, 0.5, -1]);
  });
});
