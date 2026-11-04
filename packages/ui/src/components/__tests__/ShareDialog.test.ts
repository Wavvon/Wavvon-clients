import { describe, it, expect } from "vitest";
import { estimateKbps, shareVideoConstraints, declaredQuality } from "../voice/ShareDialog";

describe("share quality", () => {
  it("estimates about 2.5 Mbps for 1080p30 and respects the hub's bitrate cap", () => {
    expect(estimateKbps(1920, 1080, 30)).toBe(2488);
    expect(estimateKbps(1920, 1080, 30, { max_kbps: 1500 })).toBe(1500);
  });

  it("asks the capture for no more than the choice, and nothing for native size", () => {
    const q = { width: 2560, height: 1440, fps: 60, kbps: 8000, audio: false };
    expect(shareVideoConstraints(q)).toEqual({
      frameRate: { ideal: 60, max: 60 },
      width: { max: 2560 },
      height: { max: 1440 },
    });
    expect(shareVideoConstraints({ ...q, width: undefined, height: undefined })).toEqual({
      frameRate: { ideal: 60, max: 60 },
    });
  });

  it("declares a native share at the size the track was captured", () => {
    const track = { getSettings: () => ({ width: 3440, height: 1440 }) } as MediaStreamTrack;
    const native = { fps: 30, kbps: 6000, audio: true };
    expect(declaredQuality(native, track)).toEqual({ width: 3440, height: 1440, fps: 30, kbps: 6000 });
  });
});
