import { describe, it, expect } from "vitest";
import { dmPeerLabel } from "../dmPeerLabel";
import type { User } from "../../types";

const member = { public_key: "a".repeat(64), display_name: "Local Name" } as User;

describe("dmPeerLabel", () => {
  it("prefers the name this hub has", () => {
    expect(dmPeerLabel(member.public_key, [member], { [member.public_key]: "Learned" })).toBe("Local Name");
  });
  it("falls back to a name learned where the DM started (a person on an allied hub)", () => {
    expect(dmPeerLabel("b".repeat(64), [member], { ["b".repeat(64)]: "Alice" })).toBe("Alice");
  });
  it("ends at a key prefix", () => {
    expect(dmPeerLabel("c".repeat(64), [member])).toBe("c".repeat(12));
  });
});
