import { findTreeNode, type TreeNode } from "@wavvon/core";
import type { AllianceSharedChannel } from "@shared/types";

// nested-channels-ux.md §2.2: cap the per-level indent so deep trees don't
// eat the whole sidebar width, and let categories past DRILL_DEPTH be
// "drilled into" (re-rooted) instead of indented further.
export const INDENT_CAP = 5;
export const STEP = 12;
export const DRILL_DEPTH = 4;

export interface IndentInfo {
  paddingLeft: number;
  overflow: boolean;
}

export function computeIndent(depth: number): IndentInfo {
  return { paddingLeft: Math.min(depth, INDENT_CAP) * STEP, overflow: depth > INDENT_CAP };
}

export interface DrillInScope {
  roots: TreeNode[];
  depthOffset: number;
}

/**
 * Resolves what the sidebar should render given the current drill-in
 * focus: either the whole tree (depthOffset 0) or, once focused, just the
 * focused category's children re-based to indent 0. Falls back to the
 * whole tree if the focused id no longer exists (deleted while drilled
 * in) — the caller also clears `focusedSubtreeId` in that case.
 */
export function resolveDrillInScope(tree: TreeNode[], focusedSubtreeId: string | null): DrillInScope {
  if (!focusedSubtreeId) return { roots: tree, depthOffset: 0 };
  const focusedRoot = findTreeNode(tree, focusedSubtreeId);
  if (!focusedRoot) return { roots: tree, depthOffset: 0 };
  return { roots: focusedRoot.children, depthOffset: focusedRoot.depth + 1 };
}

export interface AllianceFlatNode {
  channel: AllianceSharedChannel;
  depth: number;
}

/**
 * Builds a well-rooted forest from an alliance's shared-channel list
 * (roots = entries whose parent isn't itself in the set — either
 * parent_id is null, or it points at an entry the server didn't include,
 * e.g. filtered out as already-local). Order within each parent is
 * preserved as returned by the server.
 */
export function flattenAllianceChannels(entries: AllianceSharedChannel[]): AllianceFlatNode[] {
  const ids = new Set(entries.map((e) => e.channel_id));
  const byParent = new Map<string | null, AllianceSharedChannel[]>();
  for (const e of entries) {
    const parentKey = e.parent_id && ids.has(e.parent_id) ? e.parent_id : null;
    const list = byParent.get(parentKey) ?? [];
    list.push(e);
    byParent.set(parentKey, list);
  }
  const result: AllianceFlatNode[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const e of byParent.get(parentId) ?? []) {
      result.push({ channel: e, depth });
      walk(e.channel_id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export function allianceChannelIcon(c: AllianceSharedChannel): string {
  if (c.is_category) return "📁";
  switch (c.channel_type) {
    case "forum": return "💬";
    case "banner": return "🖼️";
    case "spawner": return "🎙️";
    default: return "#";
  }
}
