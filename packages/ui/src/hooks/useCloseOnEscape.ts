import { useEffect, useRef } from "react";

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
 * void.
 *
 * Nested overlays: only the most recently opened one answers, so one Escape
 * closes one layer (a composer over the events modal, a staging panel over an
 * event card). Order is the order of becoming enabled, not of re-rendering —
 * the handler is read through a ref so a parent that re-renders with a fresh
 * `onClose` does not jump the queue.
 */
const open: object[] = [];

export function useCloseOnEscape(onClose: () => void, enabled = true): void {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    const token = {};
    open.push(token);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open[open.length - 1] === token) latest.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      open.splice(open.indexOf(token), 1);
    };
  }, [enabled]);
}
