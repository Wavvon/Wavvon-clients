export interface Channel {
  id: string;
  name: string;
  created_by: string;
  parent_id: string | null;
  is_category: boolean;
  channel_type?: "text" | "forum" | "banner";
  banner_url?: string | null;
  banner_file_id?: string | null;
  display_order: number;
  description: string | null;
  icon: string | null;
  color: string | null;
  custom_icon_svg: string | null;
  created_at: number;
}

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

export function computeDepth(channels: Channel[], parentId: string | null): number {
  if (parentId === null) return 0;
  const parent = channels.find((c) => c.id === parentId);
  if (!parent) return 0;
  return 1 + computeDepth(channels, parent.parent_id ?? null);
}

/**
 * Root-to-leaf ancestor chain for a channel, including the channel itself.
 * Powers permalink breadcrumbs, the drill-in back-crumb, and permalink
 * resolution (see nested-channels-ux.md §1.4 / §2.4) — one tree-walk, three
 * surfaces. Returns `[]` if `id` isn't in `channels` (deleted / not visible).
 */
export function channelPath(channels: Channel[], id: string): Channel[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const start = byId.get(id);
  if (!start) return [];

  const path: Channel[] = [start];
  const seen = new Set<string>([id]);
  let current = start;
  while (current.parent_id !== null) {
    if (seen.has(current.parent_id)) break; // defend against a parent_id cycle
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    path.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return path.reverse();
}

/**
 * Finds a node anywhere in the tree by channel id. Shared by
 * `descendantIds` and the sidebar drill-in re-rooting (nested-channels-ux.md
 * §2.2) — one tree-walk, multiple callers.
 */
export function findTreeNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.node.id === id) return n;
    const found = findTreeNode(n.children, id);
    if (found) return found;
  }
  return null;
}

export function descendantIds(tree: TreeNode[], id: string): Set<string> {
  function collectIds(nodes: TreeNode[], acc: Set<string>) {
    for (const n of nodes) {
      acc.add(n.node.id);
      collectIds(n.children, acc);
    }
  }
  const root = findTreeNode(tree, id);
  const ids = new Set<string>();
  if (root) collectIds(root.children, ids);
  return ids;
}
