import { describe, it, expect } from "vitest";
import { applyProbeResult, OFFLINE_AFTER_FAILURES, type HubPingState } from "../useHubPing";

const fresh: HubPingState = { ping: undefined, failures: 0 };

describe("hub ping state", () => {
  // The bug this pins: both clients wrote `null` in the probe's catch, and the
  // sidebar read `ping === null` as the word "offline". One timeout, one 429,
  // or one tick landing inside a reconnect window was enough to label a hub
  // down while the live socket was reporting 32 ms in the channel header.
  it("does not call a hub offline on a single failed probe", () => {
    const measured = applyProbeResult(fresh, { ok: true, ms: 32 });
    expect(measured.ping).toBe(32);

    const once = applyProbeResult(measured, { ok: false });
    expect(once.ping).toBe(32);
    expect(once.failures).toBe(1);
  });

  it("calls it offline only after a run of them", () => {
    let s = applyProbeResult(fresh, { ok: true, ms: 32 });
    for (let i = 0; i < OFFLINE_AFTER_FAILURES - 1; i++) {
      s = applyProbeResult(s, { ok: false });
      expect(s.ping).toBe(32);
    }
    s = applyProbeResult(s, { ok: false });
    expect(s.ping).toBeNull();
  });

  it("stays silent rather than guessing before the first reading", () => {
    const s = applyProbeResult(fresh, { ok: false });
    expect(s.ping).toBeUndefined();
  });

  it("forgets the run as soon as one probe answers", () => {
    let s = applyProbeResult(fresh, { ok: true, ms: 40 });
    s = applyProbeResult(s, { ok: false });
    s = applyProbeResult(s, { ok: false });
    s = applyProbeResult(s, { ok: true, ms: 18 });
    expect(s).toEqual({ ping: 18, failures: 0 });

    s = applyProbeResult(s, { ok: false });
    expect(s.ping).toBe(18);
  });

  it("recovers from offline back to a reading", () => {
    let s: HubPingState = { ping: null, failures: OFFLINE_AFTER_FAILURES };
    s = applyProbeResult(s, { ok: true, ms: 25 });
    expect(s).toEqual({ ping: 25, failures: 0 });
  });
});
