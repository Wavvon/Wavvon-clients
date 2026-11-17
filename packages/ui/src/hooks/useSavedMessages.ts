import { useCallback, useMemo, useRef } from "react";
import {
  markSavedDeleted, parseSaved, savedKey, toggleSaved, type SavedMessage,
} from "../utils/savedMessages";

/** The Saved list over whatever raw string the app persists it as (web: a
 *  synced localStorage key; desktop: local storage plus the synced setting). */
export function useSavedMessages(raw: string | null, setRaw: (raw: string) => void) {
  const list = useMemo(() => parseSaved(raw), [raw]);
  const listRef = useRef(list);
  listRef.current = list;

  const update = useCallback((f: (l: SavedMessage[]) => SavedMessage[]) => {
    const next = f(listRef.current);
    if (next === listRef.current) return;
    listRef.current = next;
    setRaw(JSON.stringify(next));
  }, [setRaw]);

  const keys = useMemo(() => new Set(list.map(savedKey)), [list]);

  return {
    list,
    isSaved: useCallback((hubId: string, messageId: string) => keys.has(`${hubId}:${messageId}`), [keys]),
    toggle: useCallback((entry: SavedMessage) => update((l) => toggleSaved(l, entry)), [update]),
    remove: useCallback((key: string) => update((l) => l.filter((s) => savedKey(s) !== key)), [update]),
    markDeleted: useCallback((hubId: string, messageId: string) =>
      update((l) => markSavedDeleted(l, hubId, messageId)), [update]),
  };
}

export type SavedMessages = ReturnType<typeof useSavedMessages>;
