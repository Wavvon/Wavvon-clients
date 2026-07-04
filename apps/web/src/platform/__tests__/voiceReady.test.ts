import { describe, it, expect } from "vitest";
import { resolveVoiceChannelId } from "../voiceReady";

describe("resolveVoiceChannelId (temp-voice-channels.md §2)", () => {
  it("uses the requested channel id when the ready frame carries none", () => {
    expect(resolveVoiceChannelId("spawner-1", {})).toBe("spawner-1");
  });

  it("prefers the ready frame's channel id when present — the spawned room, not the spawner", () => {
    expect(resolveVoiceChannelId("spawner-1", { channel_id: "temp-room-2" })).toBe("temp-room-2");
  });

  it("falls back to the requested id for an empty-string channel_id", () => {
    expect(resolveVoiceChannelId("channel-a", { channel_id: "" })).toBe("channel-a");
  });
});
