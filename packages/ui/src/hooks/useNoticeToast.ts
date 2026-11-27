import { useCallback, useEffect, useRef, useState } from "react";

export interface Notice {
  message: string;
  undo?: () => void;
}

/** State for a neutral, self-dismissing confirmation (not an error). */
export function useNoticeToast(durationMs = 5000) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissNotice = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNotice(null);
  }, []);

  const showNotice = useCallback((message: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice({ message, undo });
    timer.current = setTimeout(() => setNotice(null), durationMs);
  }, [durationMs]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { notice, showNotice, dismissNotice };
}
