import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  dismissReminder, dueReminders, markReminded, markSavedDeleted, parseSaved, savedKey, setReminder,
  toggleSaved, type SavedMessage,
} from "../utils/savedMessages";

// setTimeout overflows past 2^31-1 ms and fires at once.
const MAX_DELAY = 2_147_483_647;

/** The Saved list over whatever raw string the app persists it as (web: a
 *  synced localStorage key; desktop: local storage plus the synced setting).
 *  `onDue` is called with each reminder as it comes due, once: it is marked
 *  fired in the list, which is what another device reads too. */
export function useSavedMessages(
  raw: string | null,
  setRaw: (raw: string) => void,
  onDue?: (due: SavedMessage[]) => void,
) {
  const list = useMemo(() => parseSaved(raw), [raw]);
  const listRef = useRef(list);
  listRef.current = list;
  const onDueRef = useRef(onDue);
  onDueRef.current = onDue;

  const update = useCallback((f: (l: SavedMessage[]) => SavedMessage[]) => {
    const next = f(listRef.current);
    if (next === listRef.current) return;
    listRef.current = next;
    setRaw(JSON.stringify(next));
  }, [setRaw]);

  const keys = useMemo(() => new Set(list.filter((s) => !s.remind_only).map(savedKey)), [list]);

  useEffect(() => {
    const fire = () => {
      const { due } = dueReminders(listRef.current);
      if (due.length === 0) return;
      update((l) => markReminded(l, new Set(due.map(savedKey))));
      onDueRef.current?.(due);
    };
    const { due, next } = dueReminders(list);
    if (due.length) { fire(); return; }
    if (next === null) return;
    const timer = setTimeout(fire, Math.min(MAX_DELAY, Math.max(0, next - Date.now() + 50)));
    return () => clearTimeout(timer);
  }, [list, update]);

  return {
    list,
    /** Reminders that fired and wait to be dismissed. */
    dueCount: list.filter((s) => s.reminded).length,
    isSaved: useCallback((hubId: string, messageId: string) => keys.has(`${hubId}:${messageId}`), [keys]),
    toggle: useCallback((entry: SavedMessage) => update((l) => toggleSaved(l, entry)), [update]),
    remove: useCallback((key: string) => update((l) => l.filter((s) => savedKey(s) !== key)), [update]),
    markDeleted: useCallback((hubId: string, messageId: string) =>
      update((l) => markSavedDeleted(l, hubId, messageId)), [update]),
    remind: useCallback((entry: SavedMessage, at: number) => update((l) => setReminder(l, entry, at)), [update]),
    dismissReminder: useCallback((key: string) => update((l) => dismissReminder(l, key)), [update]),
  };
}

export type SavedMessages = ReturnType<typeof useSavedMessages>;
