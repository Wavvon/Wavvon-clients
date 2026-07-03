import { findTreeNode, type TreeNode } from "@wavvon/core";

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
