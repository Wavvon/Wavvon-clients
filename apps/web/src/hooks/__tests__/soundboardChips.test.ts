import { describe, it, expect } from "vitest";
import { parseSoundboardPlayedEvent } from "../useSoundboardChips";

describe("parseSoundboardPlayedEvent", () => {
  it("accepts a well-formed soundboard_played payload", () => {
    const raw = {
      type: "soundboard_played",
      channel_id: "ch1",
      clip_id: "clip1",
      clip_name: "airhorn",
      public_key: "abc123",
      _hub_id: "hub1",
    };
    expect(parseSoundboardPlayedEvent(raw)).toEqual({
      channel_id: "ch1",
      clip_id: "clip1",
      clip_name: "airhorn",
      public_key: "abc123",
    });
  });

  it.each([
    { channel_id: "", clip_id: "c", clip_name: "n", public_key: "p" },
    { channel_id: "ch1", clip_id: "c", clip_name: "n" },
    { channel_id: "ch1", clip_id: 5, clip_name: "n", public_key: "p" },
  ])("rejects a malformed payload %#", (raw) => {
    expect(parseSoundboardPlayedEvent(raw)).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parseSoundboardPlayedEvent(null)).toBeNull();
    expect(parseSoundboardPlayedEvent("soundboard_played")).toBeNull();
    expect(parseSoundboardPlayedEvent(undefined)).toBeNull();
  });
});
