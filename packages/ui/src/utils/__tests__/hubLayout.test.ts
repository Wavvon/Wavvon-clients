import { describe, it, expect } from "vitest";
import {
  EMPTY_LAYOUT, parseLayout, pruneLayout, togglePin, createFolder, moveHubToFolder,
  movePinned, badgeHome, tabBadges,
} from "../hubLayout";

const withFolder = moveHubToFolder(
  moveHubToFolder(togglePin(createFolder(EMPTY_LAYOUT, "Games", "f1"), "f1"), "a", "f1"),
  "b",
  "f1",
);

describe("hubLayout", () => {
  it("reads garbage as the empty layout", () => {
    expect(parseLayout("not json")).toEqual(EMPTY_LAYOUT);
    expect(parseLayout(JSON.stringify({ folders: 3 }))).toEqual(EMPTY_LAYOUT);
  });

  it("counts a notification in exactly one place", () => {
    // a: in the pinned folder; b: in it and pinned itself; c: loose.
    const layout = togglePin(withFolder, "b");
    expect(badgeHome(layout, "a")).toBe("f1");
    expect(badgeHome(layout, "b")).toBe("b");
    expect(badgeHome(layout, "c")).toBeNull();
    const { tabs, rest } = tabBadges(layout, ["a", "b", "c"], { a: 2, b: 1, c: 4 }, { a: true });
    expect(tabs).toEqual({ f1: { count: 2, mention: true }, b: { count: 1, mention: false } });
    expect(rest).toEqual({ count: 4, mention: false });
  });

  it("a hub moved into a folder loses its own tab", () => {
    const pinnedHub = togglePin(withFolder, "c");
    expect(moveHubToFolder(pinnedHub, "c", "f1").pinned).toEqual(["f1"]);
  });

  it("reorders tabs and forgets hubs that are gone", () => {
    const layout = togglePin(togglePin(withFolder, "c"), "d");
    expect(movePinned(layout, "d", "f1").pinned).toEqual(["d", "f1", "c"]);
    const pruned = pruneLayout(layout, ["a", "c"]);
    expect(pruned.pinned).toEqual(["f1", "c"]);
    expect(pruned.folders[0].hubs).toEqual(["a"]);
  });
});
