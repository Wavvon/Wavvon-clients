// Pure ordering logic for the multi-account table, kept separate from
// store.ts (which is IndexedDB-backed and not unit-testable in isolation).

export interface OrderableAccount {
  id: string;
  account_order?: number;
  account_label?: string;
}

// Explicit account_order wins; accounts without one (created before this
// feature shipped, or never reordered) sort after every ordered account, in
// a stable order by label — falling back to id — so the list doesn't jitter
// across refreshes.
export function sortAccountsByOrder<T extends OrderableAccount>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => {
    const ao = a.account_order;
    const bo = b.account_order;
    if (ao != null && bo != null) {
      if (ao !== bo) return ao - bo;
      return compareFallback(a, b);
    }
    if (ao != null) return -1;
    if (bo != null) return 1;
    return compareFallback(a, b);
  });
}

function compareFallback(a: OrderableAccount, b: OrderableAccount): number {
  const al = (a.account_label ?? a.id).toLowerCase();
  const bl = (b.account_label ?? b.id).toLowerCase();
  if (al !== bl) return al < bl ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Sequential 1-based positions for a full reorder pass, keyed by id, derived
// from the row order the caller wants persisted.
export function renumberAccountOrder(idsInOrder: string[]): Map<string, number> {
  const positions = new Map<string, number>();
  idsInOrder.forEach((id, index) => positions.set(id, index + 1));
  return positions;
}

// account_order for a freshly created account: appended to the end, one past
// the highest existing value. Accounts without an explicit order don't count
// toward the max — they already sort last, so a new account still lands
// after them by using the highest *ordered* value, not their absence.
export function nextAccountOrder(accounts: OrderableAccount[]): number {
  let max = 0;
  for (const account of accounts) {
    if (account.account_order != null && account.account_order > max) max = account.account_order;
  }
  return max + 1;
}

// Drag-and-drop reorder: moves draggedId to sit immediately before targetId.
// No-ops if either id is unknown or they're the same row.
export function reorderByDrop(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids;
  if (!ids.includes(draggedId) || !ids.includes(targetId)) return ids;
  const without = ids.filter((id) => id !== draggedId);
  const targetIndex = without.indexOf(targetId);
  return [...without.slice(0, targetIndex), draggedId, ...without.slice(targetIndex)];
}

// Keyboard reorder: swaps id with its neighbor one step in the given
// direction. No-ops at either end of the list.
export function moveByStep(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  if (index === -1) return ids;
  const target = index + direction;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
