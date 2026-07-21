import { describe, expect, it } from "vitest";
import { toggleTagSelection } from "../forumTags";

describe("toggleTagSelection", () => {
  it("adds an unselected tag", () => {
    expect(toggleTagSelection([], "a")).toEqual(["a"]);
    expect(toggleTagSelection(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes an already-selected tag", () => {
    expect(toggleTagSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("is a no-op past the cap", () => {
    const atCap = ["a", "b", "c", "d", "e"];
    expect(toggleTagSelection(atCap, "f", 5)).toEqual(atCap);
  });

  it("still allows removal while at the cap", () => {
    const atCap = ["a", "b", "c", "d", "e"];
    expect(toggleTagSelection(atCap, "c", 5)).toEqual(["a", "b", "d", "e"]);
  });
});
