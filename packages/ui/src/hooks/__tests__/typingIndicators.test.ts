import { describe, it, expect } from "vitest";
import { typingKey, typingForScope, type TypingMap } from "../useTypingIndicators";

const MAP: TypingMap = {
  [typingKey("chan-1", "alice")]: { name: "Alice", ts: 1 },
  [typingKey("chan-1", "bob")]: { name: "Bob", ts: 2 },
  [typingKey("chan-2", "alice")]: { name: "Alice", ts: 3 },
};

describe("typing scope keys", () => {
  // Desktop keyed by bare pubkey and filtered by channel where the event
  // arrived, so whoever was typing when you left a channel appeared to be
  // typing in the one you switched to, until the staleness sweep caught up.
  // Scoping the key is what makes that impossible rather than short-lived.
  it("keeps one person's two channels apart", () => {
    expect(typingForScope(MAP, "chan-1")).toEqual({
      "chan-1:alice": { name: "Alice", ts: 1 },
      "chan-1:bob": { name: "Bob", ts: 2 },
    });
    expect(typingForScope(MAP, "chan-2")).toEqual({
      "chan-2:alice": { name: "Alice", ts: 3 },
    });
  });

  it("is empty with no scope selected, rather than showing everything", () => {
    expect(typingForScope(MAP, undefined)).toEqual({});
  });

  it("does not match a scope that is only a prefix of another", () => {
    const map: TypingMap = { [typingKey("chan-10", "alice")]: { name: "Alice", ts: 1 } };
    expect(typingForScope(map, "chan-1")).toEqual({});
  });
});
