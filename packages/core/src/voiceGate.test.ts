import { describe, expect, it } from "vitest";
import { INITIAL_SUB_GATE_STATE, nextSubGateState, type SubGateState } from "./voiceGate";

const base = { vadEnabled: true, threshold: 0.02, muted: false };

function run(frames: [energy: number, now: number][], over: Partial<typeof base> = {}): SubGateState {
  let s = INITIAL_SUB_GATE_STATE;
  for (const [energy, now] of frames) s = nextSubGateState(s, { ...base, ...over, energy, now });
  return s;
}

const steady = (energy: number, fromMs: number, toMs: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let t = fromMs; t <= toMs; t += 100) out.push([energy, t]);
  return out;
};

describe("nextSubGateState", () => {
  it("warns after sustained sub-threshold signal", () => {
    expect(run(steady(0.012, 0, 3900)).warning).toBe(false);
    expect(run(steady(0.012, 0, 4000)).warning).toBe(true);
  });

  it("does not warn on silence", () => {
    expect(run(steady(0.001, 0, 20000)).warning).toBe(false);
  });

  it("clears when the threshold is crossed", () => {
    const s = run([...steady(0.012, 0, 5000), [0.05, 5100]]);
    expect(s).toBe(INITIAL_SUB_GATE_STATE);
  });

  it("clears on mute and when VAD is off", () => {
    const warned = steady(0.012, 0, 5000);
    expect(run([...warned, [0.012, 5100]], { muted: true }).warning).toBe(false);
    expect(run(warned, { vadEnabled: false }).warning).toBe(false);
  });

  it("survives short pauses but not long ones", () => {
    expect(run([...steady(0.012, 0, 3000), [0, 3500], ...steady(0.012, 3600, 4200)]).warning).toBe(true);
    expect(run([...steady(0.012, 0, 3000), [0, 5000], [0.012, 5100]]).warning).toBe(false);
  });

  it("still has a band when the threshold is very low", () => {
    expect(run(steady(0.004, 0, 4000), { threshold: 0.006 }).warning).toBe(true);
  });
});
