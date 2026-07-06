import { describe, it, expect } from "vitest";
import { buildChannelTree, flattenTree, computeDepth, descendantIds } from "@wavvon/core";
import type { Channel } from "../types";

function ch(
  id: string,
  parent_id: string | null,
  display_order: number,
  extra: Partial<Channel> = {}
): Channel {
  return {
    id,
    name: id,
    created_by: "test",
    parent_id,
    is_category: false,
    channel_type: "text",
    display_order,
    description: null,
    icon: null,
    color: null,
    custom_icon_svg: null,
    created_at: 0,
    ...extra,
  };
}

describe("buildChannelTree", () => {
  it("returns empty array for empty input", () => {
    expect(buildChannelTree([])).toEqual([]);
  });

  it("builds a flat list of root channels", () => {
    const channels = [ch("a", null, 0), ch("b", null, 1), ch("c", null, 2)];
    const tree = buildChannelTree(channels);
    expect(tree).toHaveLength(3);
    expect(tree.map((n) => n.node.id)).toEqual(["a", "b", "c"]);
    tree.forEach((n) => expect(n.children).toHaveLength(0));
  });

  it("sorts root channels by display_order", () => {
    const channels = [ch("b", null, 2), ch("a", null, 0), ch("c", null, 1)];
    const tree = buildChannelTree(channels);
    expect(tree.map((n) => n.node.id)).toEqual(["a", "c", "b"]);
  });

  it("nests children under their parent", () => {
    const channels = [ch("root", null, 0), ch("child", "root", 0)];
    const tree = buildChannelTree(channels);
    expect(tree).toHaveLength(1);
    expect(tree[0].node.id).toBe("root");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].node.id).toBe("child");
  });

  it("assigns correct depth values", () => {
    const channels = [
      ch("root", null, 0),
      ch("child", "root", 0),
      ch("grandchild", "child", 0),
    ];
    const tree = buildChannelTree(channels);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("handles multiple children at the same level", () => {
    const channels = [
      ch("root", null, 0),
      ch("c1", "root", 0),
      ch("c2", "root", 1),
    ];
    const tree = buildChannelTree(channels);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children.map((n) => n.node.id)).toEqual(["c1", "c2"]);
  });
});

describe("flattenTree", () => {
  it("returns empty array for empty tree", () => {
    expect(flattenTree([])).toEqual([]);
  });

  it("flattens a single-level tree in order", () => {
    const channels = [ch("a", null, 0), ch("b", null, 1)];
    const flat = flattenTree(buildChannelTree(channels));
    expect(flat.map((n) => n.node.id)).toEqual(["a", "b"]);
  });

  it("flattens a nested tree in DFS order", () => {
    const channels = [
      ch("root", null, 0),
      ch("child1", "root", 0),
      ch("child2", "root", 1),
      ch("grandchild", "child1", 0),
    ];
    const flat = flattenTree(buildChannelTree(channels));
    expect(flat.map((n) => n.node.id)).toEqual([
      "root",
      "child1",
      "grandchild",
      "child2",
    ]);
  });

  it("sets childrenCount correctly", () => {
    const channels = [
      ch("root", null, 0),
      ch("child", "root", 0),
    ];
    const flat = flattenTree(buildChannelTree(channels));
    expect(flat[0].childrenCount).toBe(1);
    expect(flat[1].childrenCount).toBe(0);
  });

  it("sets parentId correctly", () => {
    const channels = [ch("root", null, 0), ch("child", "root", 0)];
    const flat = flattenTree(buildChannelTree(channels));
    expect(flat[0].parentId).toBeNull();
    expect(flat[1].parentId).toBe("root");
  });
});

describe("computeDepth", () => {
  const channels = [
    ch("root", null, 0),
    ch("child", "root", 0),
    ch("grandchild", "child", 0),
  ];

  it("returns 0 for null parentId (root level)", () => {
    expect(computeDepth(channels, null)).toBe(0);
  });

  it("returns 1 for a direct child of root", () => {
    expect(computeDepth(channels, "root")).toBe(1);
  });

  it("returns 2 for a grandchild", () => {
    expect(computeDepth(channels, "child")).toBe(2);
  });

  it("returns 0 for an unknown parentId", () => {
    expect(computeDepth(channels, "nonexistent")).toBe(0);
  });
});

describe("descendantIds", () => {
  const channels = [
    ch("root", null, 0),
    ch("child1", "root", 0),
    ch("child2", "root", 1),
    ch("grandchild", "child1", 0),
  ];

  it("returns empty set for a leaf node", () => {
    const tree = buildChannelTree(channels);
    expect(descendantIds(tree, "grandchild").size).toBe(0);
  });

  it("returns direct children for a node with children", () => {
    const tree = buildChannelTree(channels);
    const ids = descendantIds(tree, "root");
    expect(ids.has("child1")).toBe(true);
    expect(ids.has("child2")).toBe(true);
    expect(ids.has("grandchild")).toBe(true);
    expect(ids.has("root")).toBe(false);
  });

  it("returns all descendants recursively", () => {
    const tree = buildChannelTree(channels);
    const ids = descendantIds(tree, "child1");
    expect(ids.has("grandchild")).toBe(true);
    expect(ids.has("child2")).toBe(false);
  });

  it("returns empty set for unknown id", () => {
    const tree = buildChannelTree(channels);
    expect(descendantIds(tree, "nonexistent").size).toBe(0);
  });
});
