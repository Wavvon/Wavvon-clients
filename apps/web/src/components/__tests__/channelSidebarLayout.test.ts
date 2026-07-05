import { describe, it, expect } from "vitest";
import { buildChannelTree, type Channel } from "@wavvon/core";
import type { AllianceSharedChannel } from "../../types";
import { computeIndent, resolveDrillInScope, flattenAllianceChannels, allianceChannelIcon } from "../channelSidebarLayout";

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

describe("computeIndent (nested-channels-ux.md §2.2)", () => {
  it("scales linearly up to the indent cap", () => {
    expect(computeIndent(0)).toEqual({ paddingLeft: 0, overflow: false });
    expect(computeIndent(1)).toEqual({ paddingLeft: 12, overflow: false });
    expect(computeIndent(5)).toEqual({ paddingLeft: 60, overflow: false });
  });

  it("clamps padding at the cap once depth exceeds it, and flags overflow", () => {
    expect(computeIndent(6)).toEqual({ paddingLeft: 60, overflow: true });
    expect(computeIndent(20)).toEqual({ paddingLeft: 60, overflow: true });
  });
});

describe("resolveDrillInScope (nested-channels-ux.md §2.2)", () => {
  const games = makeChannel("games", null, { name: "Games", is_category: true });
  const lol = makeChannel("lol", "games", { name: "LoL", is_category: true });
  const alliance = makeChannel("alliance", "lol", { name: "Alliance", is_category: true });
  const raidPlanning = makeChannel("raid-planning", "alliance", { name: "raid-planning" });
  const channels: Channel[] = [games, lol, alliance, raidPlanning];
  const tree = buildChannelTree(channels);

  it("returns the whole tree with no offset when nothing is focused", () => {
    const scope = resolveDrillInScope(tree, null);
    expect(scope.roots).toBe(tree);
    expect(scope.depthOffset).toBe(0);
  });

  it("re-roots to the focused category's children, offset so they render from indent 0", () => {
    const scope = resolveDrillInScope(tree, "alliance");
    expect(scope.roots.map((n) => n.node.id)).toEqual(["raid-planning"]);
    expect(scope.depthOffset).toBe(3);
    expect(scope.roots[0].depth - scope.depthOffset).toBe(0);
  });

  it("falls back to the whole tree if the focused id no longer exists", () => {
    const scope = resolveDrillInScope(tree, "deleted-category");
    expect(scope.roots).toBe(tree);
    expect(scope.depthOffset).toBe(0);
  });
});

function makeShared(
  channel_id: string,
  parent_id: string | null,
  overrides: Partial<AllianceSharedChannel> = {}
): AllianceSharedChannel {
  return {
    channel_id,
    channel_name: channel_id,
    hub_public_key: "hub-pk",
    hub_name: "Other Hub",
    channel_type: "text",
    parent_id,
    is_category: false,
    ...overrides,
  };
}

describe("flattenAllianceChannels (alliance space-sharing v2)", () => {
  it("orders a flat list of root channels at depth 0", () => {
    const flat = flattenAllianceChannels([makeShared("a", null), makeShared("b", null)]);
    expect(flat.map((f) => [f.channel.channel_id, f.depth])).toEqual([["a", 0], ["b", 0]]);
  });

  it("nests children under a recursively-shared category by parent_id", () => {
    const category = makeShared("games", null, { is_category: true });
    const child = makeShared("raid-planning", "games");
    const grandchild = makeShared("loot", "raid-planning", { is_category: true });
    const flat = flattenAllianceChannels([category, child, grandchild]);
    expect(flat.map((f) => [f.channel.channel_id, f.depth])).toEqual([
      ["games", 0],
      ["raid-planning", 1],
      ["loot", 2],
    ]);
  });

  it("treats an entry whose parent isn't in the set as a root", () => {
    const orphan = makeShared("orphan", "not-shared");
    const flat = flattenAllianceChannels([orphan]);
    expect(flat).toEqual([{ channel: orphan, depth: 0 }]);
  });
});

describe("allianceChannelIcon (alliance space-sharing v2)", () => {
  it("marks categories with a folder icon regardless of channel_type", () => {
    expect(allianceChannelIcon(makeShared("c", null, { is_category: true }))).toBe("📁");
  });

  it("picks a type-specific icon for non-category channels", () => {
    expect(allianceChannelIcon(makeShared("c", null, { channel_type: "text" }))).toBe("#");
    expect(allianceChannelIcon(makeShared("c", null, { channel_type: "forum" }))).toBe("💬");
    expect(allianceChannelIcon(makeShared("c", null, { channel_type: "banner" }))).toBe("🖼️");
    expect(allianceChannelIcon(makeShared("c", null, { channel_type: "spawner" }))).toBe("🎙️");
  });
});
