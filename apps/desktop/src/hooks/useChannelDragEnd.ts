import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { invoke } from "@tauri-apps/api/core";
import { flattenTree, descendantIds, computeDepth } from "@wavvon/core";
import type { TreeNode } from "@wavvon/core";
import { computeDragIntent } from "@wavvon/ui";
import type { Channel } from "../types";

export function useChannelDragEnd(
  channels: Channel[],
  channelTree: TreeNode[],
  maxChannelDepth: number,
  setChannels: (channels: Channel[]) => void,
  setError: (e: string | null) => void,
) {
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Client-side cycle guard: can't drop a node into its own descendant.
    const forbidden = descendantIds(channelTree, activeId);
    if (forbidden.has(overId)) return;

    // Determine the new parent: dropping on the top/bottom edge of an item
    // reorders as a sibling; only the middle band of a category nests
    // (nested-channels-ux drag&drop fix — dropping anywhere on a category
    // used to always nest, so root-level items could never be reordered
    // around one).
    const allFlat = flattenTree(channelTree);
    const activeFlat = allFlat.find((n) => n.node.id === activeId);
    const overFlat = allFlat.find((n) => n.node.id === overId);
    if (!activeFlat || !overFlat) return;

    const intent = over.rect
      ? computeDragIntent(active.rect.current.translated, over.rect, overFlat.node.is_category)
      : "before";
    const willNest = intent === "nest";

    if (maxChannelDepth > 0) {
      const maxCodeDepth = maxChannelDepth - 1;
      const parentForDepth = willNest ? overFlat.node.id : overFlat.parentId;
      const newDepth = parentForDepth !== null
        ? computeDepth(channels, parentForDepth) + 1
        : 0;
      if (newDepth > maxCodeDepth) return;
      if (activeFlat.node.is_category && newDepth >= maxCodeDepth) return;
    }

    const newParentId = willNest ? overFlat.node.id : overFlat.parentId;
    const parentChanged = newParentId !== activeFlat.node.parent_id;

    // Optimistic parent update so the reorder below sees the new shape.
    const channelsWithNewParent = parentChanged
      ? channels.map((c) => (c.id === activeId ? { ...c, parent_id: newParentId } : c))
      : channels;

    // Reorder within the flat global list.
    const sorted = [...channelsWithNewParent].sort((a, b) => a.display_order - b.display_order);
    const oldIndex = sorted.findIndex((c) => c.id === activeId);
    const newIndex = sorted.findIndex((c) => c.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex);
    setChannels(reordered.map((c, i) => ({ ...c, display_order: i })));

    try {
      if (parentChanged) {
        await invoke("move_channel", { channelId: activeId, parentId: newParentId });
      }
      await invoke("reorder_channels", { channelIds: reordered.map((c) => c.id) });
    } catch (e) {
      setError(String(e));
    }
  }

  return handleDragEnd;
}
