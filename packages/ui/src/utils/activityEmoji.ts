// Inserts an emoji + trailing space at the start of the line containing the
// cursor, for the Activities field's game-icon row. Entries are just lines —
// no dedupe if a line already starts with an emoji, clicking again prepends
// another (see wishlist "Game icons in Activities", lazy v1).
export function insertAtLineStart(
  text: string,
  cursorPos: number,
  insert: string,
  maxLen: number,
): { text: string; cursorPos: number } | null {
  const pos = Math.max(0, Math.min(cursorPos, text.length));
  const lineStart = text.slice(0, pos).lastIndexOf("\n") + 1;
  const next = text.slice(0, lineStart) + insert + text.slice(lineStart);
  if ([...next].length > maxLen) return null;
  return { text: next, cursorPos: pos + insert.length };
}
