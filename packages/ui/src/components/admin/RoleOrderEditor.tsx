import { arrayMove } from "@dnd-kit/sortable";
import type { RoleInfo } from "../../types";

/** The roles the caller may move, highest first: what `PUT /roles/order`
 *  takes, and nothing it would refuse. `everyone` moves only on hubs with
 *  `roles.order.everyone`. */
export function movableRoles(roles: RoleInfo[], myMaxPriority: number, everyoneMovable = false): RoleInfo[] {
  return roles
    .filter((r) => r.id !== "builtin-owner" && (everyoneMovable || r.id !== "builtin-everyone") && r.priority < myMaxPriority)
    .sort((a, b) => b.priority - a.priority);
}

/** Priority is one global order while the list is shown grouped by category,
 *  so a drag inside a group permutes only the slots that group's roles already
 *  held in the global order. Returns the new global order, or null when the
 *  drag changes nothing. */
export function reorderWithinGroup(
  movableIds: string[],
  groupIds: string[],
  activeId: string,
  overId: string,
): string[] | null {
  const from = groupIds.indexOf(activeId);
  const to = groupIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  const reordered = arrayMove(groupIds, from, to);
  const inGroup = new Set(groupIds);
  let next = 0;
  return movableIds.map((id) => (inGroup.has(id) ? reordered[next++] : id));
}
