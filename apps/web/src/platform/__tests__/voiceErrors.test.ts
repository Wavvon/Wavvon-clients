import { describe, it, expect } from "vitest";
import { classifyVoiceFailure, VoiceTransportError, VOICE_JOIN_TIMEOUT } from "../voiceErrors";
import { HubApiError } from "../http";

describe("classifyVoiceFailure", () => {
  it("tells a transport failure from a refused join and a timeout", () => {
    expect(classifyVoiceFailure(new VoiceTransportError("https://h:3001", "WebTransportError", "", 4000))).toBe("transport");
    expect(classifyVoiceFailure(new Error(VOICE_JOIN_TIMEOUT))).toBe("join_timeout");
    expect(classifyVoiceFailure(new Error("something else"))).toBe("other");
  });

  it("treats a hub API error as a refused join", () => {
    const e = Object.create(HubApiError.prototype) as HubApiError;
    expect(classifyVoiceFailure(e)).toBe("join_refused");
  });
});
