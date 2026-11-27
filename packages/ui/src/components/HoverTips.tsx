import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Tip { text: string; x: number; y: number; below: boolean }

/**
 * Shows any element's `title` the moment the pointer reaches it, instead
 * of the browser's own tooltip, which takes a second or more and longer
 * still on some systems. Mounted once per app; every `title` in the
 * page benefits without changing the components that set it. The title is
 * lifted off the element while the tip shows, so the native one does not
 * follow, and put back when the pointer leaves.
 */
export function HoverTips() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let el: HTMLElement | null = null;
    let lifted: string | null = null;

    function restore() {
      if (el && lifted !== null && !el.hasAttribute("title")) el.setAttribute("title", lifted);
      el = null;
      lifted = null;
      setTip(null);
    }

    function onOver(e: PointerEvent) {
      const target = (e.target as Element | null)?.closest?.<HTMLElement>("[title]");
      if (!target || target === el) return;
      restore();
      const text = target.getAttribute("title");
      if (!text) return;
      el = target;
      lifted = text;
      target.removeAttribute("title");
      const r = target.getBoundingClientRect();
      const below = r.top < 48;
      setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
    }

    function onOut(e: PointerEvent) {
      if (el && !el.contains(e.relatedTarget as Node | null)) restore();
    }

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", restore);
    window.addEventListener("scroll", restore, true);
    return () => {
      restore();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", restore);
      window.removeEventListener("scroll", restore, true);
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <div
      className={`hover-tip${tip.below ? " below" : ""}`}
      role="tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
