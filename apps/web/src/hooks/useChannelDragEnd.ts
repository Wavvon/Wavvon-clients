import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { flattenTree, descendantIds, computeDepth } from "@wavvon/core";
import type { TreeNode } from "@wavvon/core";
import { computeDragIntent } from "@wavvon/ui";
import type { Channel } from "@shared/types";

export function useChannelDragEnd(
  channels: Channel[],
  channelTree: TreeNode[],
  maxChannelDepth: number,
  setChannels: (channels: Channel[]) => void,
) {
  async function handleChannelDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const forbidden = descendantIds(channelTree, activeId);
    if (forbidden.has(overId)) return;

    const allFlat = flattenTree(channelTree);
    const activeFlat = allFlat.find((n) => n.node.id === activeId);
    const overFlat = allFlat.find((n) => n.node.id === overId);
    if (!activeFlat || !overFlat) return;

    // Edge-zone rule (nested-channels-ux drag&drop fix): dropping on the
    // top/bottom edge of a category reorders as a sibling instead of always
    // nesting — otherwise root-level items could never be reordered around
    // a category.
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

    const channelsWithNewParent = parentChanged
      ? channels.map((c) => (c.id === activeId ? { ...c, parent_id: newParentId } : c))
      : channels;

    const sorted = [...channelsWithNewParent].sort((a, b) => a.display_order - b.display_order);
    const oldIndex = sorted.findIndex((c) => c.id === activeId);
    const newIndex = sorted.findIndex((c) => c.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex);
    setChannels(reordered.map((c, i) => ({ ...c, display_order: i })));

    try {
      const { moveChannel, reorderChannels } = await import("../platform/commands/hubAdmin");
      if (parentChanged) {
        await moveChannel(activeId, newParentId);
      }
      await reorderChannels(reordered.map((c) => c.id));
    } catch { /* optimistic — ignore network errors */ }
  }

  return handleChannelDragEnd;
}
