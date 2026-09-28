import { useEffect } from "react";

/**
 * Escape dismisses the modal.
 *
 * Ten of the twenty-three overlays shipped without it. Every one of them
 * already dismissed on an overlay click, so dismissing was never in question
 * — the keyboard just could not do what the mouse could, and the user
 * profile card in particular trapped anyone who opened it by keyboard.
 *
 * The listener is on `window`, not the overlay: focus is usually inside the
 * dialog's own inputs, and an `onKeyDown` on the overlay only fires while
 * focus is in the subtree it wraps.
 *
 * `enabled` is for a modal that renders unconditionally and hides itself, so
 * it can stop listening while closed rather than call `onClose` into the
 * void. Nested overlays each listen; the innermost one closing first is the
 * behaviour people expect, and React's own event ordering gives that for
 * free only if the outer one is unmounted — so a nested modal passes
 * `enabled: false` to its parent while it is up.
 */
export function useCloseOnEscape(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, enabled]);
}
