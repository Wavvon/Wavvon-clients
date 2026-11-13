import { useCallback, useEffect, useRef, useState } from "react";

// Text for a polite aria-live region. Messages that arrive within `delayMs`
// of the first one are read as one sentence, so a burst of voice joins and
// leaves does not queue up a screen-reader announcement each.
export function useBatchedAnnouncement(delayMs = 2000) {
  const [announcement, setAnnouncement] = useState("");
  const pendingRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const announce = useCallback((msg: string) => {
    pendingRef.current.push(msg);
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      setAnnouncement(pendingRef.current.splice(0).join(". "));
      timerRef.current = null;
    }, delayMs);
  }, [delayMs]);

  return { announcement, announce };
}
