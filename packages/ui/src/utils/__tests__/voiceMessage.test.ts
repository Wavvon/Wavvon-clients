import { describe, expect, it } from "vitest";
import { formatClock, isVoiceMessage, pickVoiceMime, voiceFileName, waveformPeaks } from "../voiceMessage";

describe("voiceMessage", () => {
  it("prefers Ogg Opus and names the file after its container", () => {
    expect(pickVoiceMime(() => true)).toBe("audio/ogg;codecs=opus");
    expect(pickVoiceMime((m) => m.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickVoiceMime(() => false)).toBeNull();
    expect(voiceFileName("audio/webm;codecs=opus", 5)).toBe("voice-message-5.webm");
    expect(isVoiceMessage(voiceFileName("audio/ogg;codecs=opus"))).toBe(true);
    expect(isVoiceMessage("voice-message-1.exe")).toBe(false);
  });

  it("scales peaks to the loudest slice", () => {
    expect(waveformPeaks(new Float32Array([0.1, -0.5, 0.25, 0.25]), 2)).toEqual([1, 0.5]);
  });

  it("formats a clock", () => {
    expect(formatClock(65.4)).toBe("1:05");
  });
});
