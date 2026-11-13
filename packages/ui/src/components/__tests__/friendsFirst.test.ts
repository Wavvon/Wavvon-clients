import { describe, it, expect } from "vitest";
import { friendsFirst } from "../../utils/friendsFirst";
import type { VoiceParticipant } from "../../types";

const p = (k: string) => ({ public_key: k, display_name: null }) as VoiceParticipant;

describe("friendsFirst", () => {
  it("puts friends first and keeps arrival order within each part", () => {
    const order = friendsFirst([p("a"), p("f1"), p("b"), p("f2")], new Set(["f2", "f1"]));
    expect(order.map((x) => x.public_key)).toEqual(["f1", "f2", "a", "b"]);
  });

  it("leaves the order alone without friends", () => {
    expect(friendsFirst([p("a"), p("b")], new Set()).map((x) => x.public_key)).toEqual(["a", "b"]);
  });
});
