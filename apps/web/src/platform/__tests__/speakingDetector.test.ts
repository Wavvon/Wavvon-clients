import { describe, it, expect } from "vitest";
import {
  DEFAULT_SPEAKING,
  INITIAL_SPEAKING_STATE,
  frameEnergy,
  nextSpeakingState,
  effectiveVad,
} from "../speakingDetector";

const QUIET = 0.001;
const LOUD = 0.3;

describe("frameEnergy", () => {
  it("is zero for silence and for an empty frame", () => {
    expect(frameEnergy(new Float32Array(480))).toBe(0);
    expect(frameEnergy(new Float32Array(0))).toBe(0);
  });

  it("is the amplitude of a constant signal", () => {
    expect(frameEnergy(new Float32Array(64).fill(0.5))).toBeCloseTo(0.5, 6);
  });

  it("ignores sign — a negative frame is just as loud", () => {
    expect(frameEnergy(new Float32Array(64).fill(-0.5))).toBeCloseTo(0.5, 6);
  });

  it("crosses the default threshold for speech-level audio but not for room noise", () => {
    expect(frameEnergy(new Float32Array(64).fill(0.1))).toBeGreaterThan(DEFAULT_SPEAKING.threshold);
    expect(frameEnergy(new Float32Array(64).fill(0.005))).toBeLessThan(DEFAULT_SPEAKING.threshold);
  });
});

describe("nextSpeakingState", () => {
  it("starts speaking on the first loud frame", () => {
    const s = nextSpeakingState(INITIAL_SPEAKING_STATE, LOUD, 1000);
    expect(s.speaking).toBe(true);
    expect(s.lastLoudAt).toBe(1000);
  });

  it("stays quiet while the signal is below the threshold", () => {
    const s = nextSpeakingState(INITIAL_SPEAKING_STATE, QUIET, 1000);
    expect(s.speaking).toBe(false);
  });

  it("holds through a short pause between words", () => {
    let s = nextSpeakingState(INITIAL_SPEAKING_STATE, LOUD, 1000);
    // 200 ms of quiet — less than the hold, so still speaking.
    s = nextSpeakingState(s, QUIET, 1200);
    expect(s.speaking).toBe(true);
  });

  it("stops once the hold elapses", () => {
    let s = nextSpeakingState(INITIAL_SPEAKING_STATE, LOUD, 1000);
    s = nextSpeakingState(s, QUIET, 1000 + DEFAULT_SPEAKING.holdMs);
    expect(s.speaking).toBe(false);
  });

  it("re-arms the hold on every loud frame, so continuous speech never lapses", () => {
    let s = nextSpeakingState(INITIAL_SPEAKING_STATE, LOUD, 0);
    for (let t = 20; t <= 5000; t += 20) {
      s = nextSpeakingState(s, LOUD, t);
      expect(s.speaking).toBe(true);
    }
  });

  it("flips exactly twice across one utterance, so one message goes out per edge", () => {
    let s = INITIAL_SPEAKING_STATE;
    let flips = 0;
    const energies: [number, number][] = [];
    for (let t = 0; t < 1000; t += 20) energies.push([t, LOUD]);      // 1 s talking
    for (let t = 1000; t < 3000; t += 20) energies.push([t, QUIET]);  // 2 s silence
    for (const [t, e] of energies) {
      const next = nextSpeakingState(s, e, t);
      if (next.speaking !== s.speaking) flips++;
      s = next;
    }
    expect(flips).toBe(2);
    expect(s.speaking).toBe(false);
  });

  it("does not flip on a pause shorter than the hold, however many frames it spans", () => {
    let s = nextSpeakingState(INITIAL_SPEAKING_STATE, LOUD, 0);
    let flips = 0;
    // Talk, brief pauses, talk — the shape of an ordinary sentence.
    for (let t = 20; t < 2000; t += 20) {
      const quiet = (t % 400) < 200; // 200 ms quiet, 200 ms loud, repeating
      const next = nextSpeakingState(s, quiet ? QUIET : LOUD, t);
      if (next.speaking !== s.speaking) flips++;
      s = next;
    }
    expect(flips).toBe(0);
    expect(s.speaking).toBe(true);
  });

  it("honours a custom threshold, which is what the voice settings expose", () => {
    const strict = { threshold: 0.5, holdMs: 400 };
    expect(nextSpeakingState(INITIAL_SPEAKING_STATE, 0.3, 0, strict).speaking).toBe(false);
    expect(nextSpeakingState(INITIAL_SPEAKING_STATE, 0.6, 0, strict).speaking).toBe(true);
  });
});

describe("effectiveVad", () => {
  it("reads the toggle and slider only under the custom profile", () => {
    expect(effectiveVad({ profile: "custom", customVad: false })).toEqual({
      enabled: false,
      threshold: DEFAULT_SPEAKING.threshold,
    });
    expect(effectiveVad({ profile: "custom", customVadThreshold: 0.09 })).toEqual({
      enabled: true,
      threshold: 0.09,
    });
    // The bug this guards: the web engine applied customVadThreshold under
    // every profile, so a slider only the custom profile shows was changing
    // how the standard profile detected speech.
    expect(effectiveVad({ profile: "standard", customVadThreshold: 0.09 }).threshold).toBe(
      DEFAULT_SPEAKING.threshold,
    );
    expect(effectiveVad({ profile: "standard", customVad: false }).enabled).toBe(true);
  });

  it("turns VAD off for music, which is the profile that must not gate silence", () => {
    expect(effectiveVad({ profile: "music" }).enabled).toBe(false);
  });

  it("defaults to enabled with no config at all", () => {
    expect(effectiveVad()).toEqual({ enabled: true, threshold: DEFAULT_SPEAKING.threshold });
  });
});
