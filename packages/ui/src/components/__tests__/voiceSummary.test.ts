import { describe, it, expect } from "vitest";
import { voiceSummary } from "../SortableItems";

// Stands in for i18n: shows the arguments it was given.
const t = (key: string, o?: Record<string, unknown>) =>
  key === "channel.voice.you" ? "you" : `${String(o?.names)} +${String(o?.count)}`;

const p = (k: string) => ({ public_key: k, display_name: k });

describe("voiceSummary", () => {
  it("names one other and self, then counts the rest", () => {
    expect(voiceSummary([p("banana"), p("me"), p("c"), p("d")], "me", t)).toBe("banana, you +2");
  });

  it("names two when self is not in the room", () => {
    expect(voiceSummary([p("a"), p("b"), p("c"), p("d")], "me", t)).toBe("a, b +2");
  });
});

import { camerasToOpen } from "../content/VoiceStage";

describe("camerasToOpen", () => {
  const streams = [
    { stream_id: "c1", sharer_pubkey: "a", kind: "webcam" },
    { stream_id: "s1", sharer_pubkey: "a", kind: "screen" },
    { stream_id: "c2", sharer_pubkey: "b", kind: "webcam" },
  ];

  it("opens every camera in a small room, never a screen", () => {
    expect(camerasToOpen(streams, [], 5)).toEqual(["c1", "c2"]);
  });

  it("opens only pinned people's cameras in a big room", () => {
    expect(camerasToOpen(streams, ["b"], 40)).toEqual(["c2"]);
  });
});
