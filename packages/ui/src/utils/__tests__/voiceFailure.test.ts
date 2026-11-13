import { describe, it, expect } from "vitest";
import { voiceTransportFailure } from "../voiceFailure";

describe("voiceTransportFailure", () => {
  it("reads a slow failure as unreachable and names the host the operator needs", () => {
    // The pilot behind a Cloudflare proxy failed after 4022 ms.
    expect(voiceTransportFailure("https://hub.example:3001/voice", 4022)).toEqual({
      key: "voice.error.unreachable",
      params: { host: "hub.example:3001" },
    });
  });

  it("reads a fast failure as refused", () => {
    expect(voiceTransportFailure("https://hub.example:3001/voice", 120).key).toBe("voice.error.refused");
  });
});
