import { useRef, useState } from "react";

/** Toast state for hub error messages (W6). */
export function useHubErrorToast() {
  const [hubErrorToast, setHubErrorToast] = useState<string | null>(null);
  const hubErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showHubError(msg: string) {
    if (hubErrorTimerRef.current) clearTimeout(hubErrorTimerRef.current);
    setHubErrorToast(msg);
    hubErrorTimerRef.current = setTimeout(() => setHubErrorToast(null), 5000);
  }
  return { hubErrorToast, showHubError };
}
