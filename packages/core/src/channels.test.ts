import { describe, it, expect } from "vitest";
import { channelPath, type Channel } from "./channels";

function makeChannel(id: string, parent_id: string | null, overrides: Partial<Channel> = {}): Channel {
  return {
    id,
    name: id,
    created_by: "someone",
    parent_id,
    is_category: false,
    display_order: 0,
    description: null,
    icon: null,
    color: null,
    custom_icon_svg: null,
    created_at: 0,
    ...overrides,
  };
}

describe("channelPath (nested-channels-ux.md §1.4)", () => {
  const games = makeChannel("games", null, { name: "Games", is_category: true });
  const lol = makeChannel("lol", "games", { name: "LoL", is_category: true });
  const alliance = makeChannel("alliance", "lol", { name: "Alliance", is_category: true });
  const raidPlanning = makeChannel("raid-planning", "alliance", { name: "raid-planning" });
  const channels: Channel[] = [games, lol, alliance, raidPlanning];

  it("walks parent_id to root, root→leaf order, inclusive of the leaf", () => {
    expect(channelPath(channels, "raid-planning")).toEqual([games, lol, alliance, raidPlanning]);
  });

  it("returns a single-element array for a root-level channel", () => {
    expect(channelPath(channels, "games")).toEqual([games]);
  });

  it("returns [] for an unknown id", () => {
    expect(channelPath(channels, "does-not-exist")).toEqual([]);
  });

  it("stops instead of looping forever on a parent_id cycle", () => {
    const a = makeChannel("a", "b");
    const b = makeChannel("b", "a");
    const cyclic = [a, b];
    const result = channelPath(cyclic, "a");
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result.map((c) => c.id)).toContain("a");
  });

  it("handles a self-referencing parent_id without infinite looping", () => {
    const selfParent = makeChannel("x", "x");
    const result = channelPath([selfParent], "x");
    expect(result).toEqual([selfParent]);
  });
});
