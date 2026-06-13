import React, { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FocusTrap({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    const focusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.closest("[inert]")
      );

    const first = focusable()[0];
    if (first) first.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        }
      } else {
        if (document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      const restore = restoreRef.current;
      if (restore && typeof (restore as HTMLElement).focus === "function") {
        (restore as HTMLElement).focus();
      }
    };
  }, []);

  return <div ref={containerRef}>{children}</div>;
}
