/** Toggles `id` in `selected`, capped at `max` (forum.md §10.1 Q2: ≤5 tags
 * per post). Adding past the cap is a no-op rather than an error — the
 * picker UI disables the button once at cap, this just makes the same
 * guarantee hold for any other caller. */
export function toggleTagSelection(selected: string[], id: string, max = 5): string[] {
  if (selected.includes(id)) return selected.filter((t) => t !== id);
  if (selected.length >= max) return selected;
  return [...selected, id];
}
