import { useEffect, useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

/** The hub's message pages: newest first on the wire, `cursor` = the id of the
 *  oldest message already held. The fetchers hand pages back oldest first. */
export const MESSAGE_PAGE_SIZE = 50;

/** Start loading the previous page this close to the top, in pixels. */
const NEAR_TOP_PX = 80;

/** Put an older page in front of what is held. A short page is the start of
 *  the channel. Ids already held are dropped: a message posted while the page
 *  was in flight shifts the hub's window, and React keys must stay unique. */
export function mergeOlderPage<T extends { id: string }>(
  held: T[],
  page: T[],
  pageSize: number,
): { items: T[]; hasMore: boolean } {
  const known = new Set(held.map((m) => m.id));
  return {
    items: [...page.filter((m) => !known.has(m.id)), ...held],
    hasMore: page.length >= pageSize,
  };
}

/** Scrollback for a message list: when the reader nears the top, fetch the
 *  page before the oldest message held, prepend it, and keep the view where it
 *  was rather than jumping to the new top. `resetKey` is the channel: a new
 *  one starts with more history assumed, and a page that arrives after the
 *  reader has moved on is dropped. */
export function useOlderPages<T extends { id: string }>({
  containerRef,
  items,
  setItems,
  fetchOlder,
  resetKey,
}: {
  containerRef: RefObject<HTMLElement | null>;
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  fetchOlder: (beforeId: string) => Promise<T[]>;
  resetKey: string | null;
}): () => void {
  const loading = useRef(false);
  const hasMore = useRef(true);
  const keyRef = useRef(resetKey);
  const heightBefore = useRef<number | null>(null);

  useEffect(() => {
    keyRef.current = resetKey;
    hasMore.current = true;
    loading.current = false;
    heightBefore.current = null;
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el && heightBefore.current !== null) {
      el.scrollTop += el.scrollHeight - heightBefore.current;
      heightBefore.current = null;
    }
  }, [items, containerRef]);

  return () => {
    const el = containerRef.current;
    if (!el || el.scrollTop > NEAR_TOP_PX) return;
    if (loading.current || !hasMore.current || items.length === 0) return;
    loading.current = true;
    const key = resetKey;
    fetchOlder(items[0].id)
      .then((page) => {
        if (keyRef.current !== key) return;
        heightBefore.current = el.scrollHeight;
        setItems((held) => {
          const merged = mergeOlderPage(held, page, MESSAGE_PAGE_SIZE);
          hasMore.current = merged.hasMore;
          return merged.items;
        });
      })
      .catch((e) => console.warn("[scrollback] could not load older messages:", e))
      .finally(() => {
        if (keyRef.current === key) loading.current = false;
      });
  };
}
