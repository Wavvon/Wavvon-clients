// Pure channel-tree helpers. No React, no Tauri.
import type { Channel } from "../types";

export interface TreeNode {
  node: Channel;
  depth: number;
  children: TreeNode[];
}

export interface FlatNode {
  node: Channel;
  depth: number;
  parentId: string | null;
  childrenCount: number;
}

export function buildChannelTree(channels: Channel[]): TreeNode[] {
  const sorted = [...channels].sort((a, b) => a.display_order - b.display_order);
  function buildChildren(parentId: string | null, depth: number): TreeNode[] {
    return sorted
      .filter((c) => c.parent_id === parentId)
      .map((c) => ({ node: c, depth, children: buildChildren(c.id, depth + 1) }));
  }
  return buildChildren(null, 0);
}

/**
 * DFS-flatten a tree into a linear list with depth annotations.
 * This is what the single flat SortableContext consumes.
 */
export function flattenTree(tree: TreeNode[]): FlatNode[] {
  const result: FlatNode[] = [];
  function walk(nodes: TreeNode[]) {
    for (const n of nodes) {
      result.push({ node: n.node, depth: n.depth, parentId: n.node.parent_id, childrenCount: n.children.length });
      walk(n.children);
    }
  }
  walk(tree);
  return result;
}

/**
 * Returns the depth a new item would sit at if placed under parentId.
 * Depth 0 = root-level (no parent). Uses the flat channels array.
 */
export function computeDepth(channels: Channel[], parentId: string | null): number {
  if (parentId === null) return 0;
  const parent = channels.find((c) => c.id === parentId);
  if (!parent) return 0;
  return 1 + computeDepth(channels, parent.parent_id ?? null);
}

/**
 * Returns the set of all descendant IDs for a given node id.
 * Used for client-side cycle detection — drops onto these IDs are forbidden.
 */
export function descendantIds(tree: TreeNode[], id: string): Set<string> {
  function findNode(nodes: TreeNode[]): TreeNode | null {
    for (const n of nodes) {
      if (n.node.id === id) return n;
      const found = findNode(n.children);
      if (found) return found;
    }
    return null;
  }
  function collectIds(nodes: TreeNode[], acc: Set<string>) {
    for (const n of nodes) {
      acc.add(n.node.id);
      collectIds(n.children, acc);
    }
  }
  const root = findNode(tree);
  const ids = new Set<string>();
  if (root) collectIds(root.children, ids);
  return ids;
}
