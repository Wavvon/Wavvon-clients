import React, { useEffect, useRef } from "react";
import { clampRect, largestFit, nearestFit, placeNew, type FreeLayout, type Layer, type Rect } from "../../utils/freeLayout";

export interface FreeItem {
  id: string;
  layer: Layer;
  node: React.ReactNode;
}

const DEFAULT_SIZE: Record<Layer, { w: number; h: number }> = {
  lives: { w: 60, h: 60 },
  people: { w: 25, h: 30 },
};

/**
 * The stage in free layout: each item sits where the member put it, sized as
 * they left it. Moving or resizing onto another item of the same layer is
 * refused (it snaps back); a camera may overlap a live, and `layout.top`
 * says which layer is drawn above.
 */
export function FreeStage({ items, layout, onChange }: {
  items: FreeItem[];
  layout: FreeLayout;
  onChange: (next: FreeLayout) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);

  // A new item takes the first free spot on its layer, shrinking until one
  // fits; on a full layer it lands small in the corner, to be moved by hand,
  // rather than not appearing at all.
  const missing = items.filter((it) => !layout.rects[it.id]);
  const placed: Record<string, Rect> = {};
  for (const it of missing) {
    const sameLayer = items
      .filter((o) => o.layer === it.layer && o.id !== it.id)
      .map((o) => layout.rects[o.id] ?? placed[o.id])
      .filter((r): r is Rect => !!r);
    const size = DEFAULT_SIZE[it.layer];
    let spot: Rect | null = null;
    for (const k of [1, 0.75, 0.5, 0.35]) {
      spot = placeNew({ w: Math.round(size.w * k), h: Math.round(size.h * k) }, sameLayer);
      if (spot) break;
    }
    placed[it.id] = spot ?? { x: 0, y: 0, w: 20, h: 20 };
  }
  const placedKey = Object.keys(placed).join(",");
  useEffect(() => {
    if (placedKey) onChange({ ...layout, rects: { ...layout.rects, ...placed } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedKey]);

  function sameLayerRects(id: string, layer: Layer): Rect[] {
    return items
      .filter((o) => o.layer === layer && o.id !== id)
      .map((o) => layout.rects[o.id])
      .filter((r): r is Rect => !!r);
  }

  function startDrag(e: React.PointerEvent, item: FreeItem, mode: "move" | "resize") {
    const area = areaRef.current;
    const start = layout.rects[item.id];
    if (!area || !start) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button, input, a")) return;
    e.preventDefault();
    e.stopPropagation();
    const box = area.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const el = e.currentTarget.closest<HTMLElement>(".free-item");
    let next = start;
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - x0) / box.width) * 100;
      const dy = ((ev.clientY - y0) / box.height) * 100;
      next = clampRect(mode === "move"
        ? { ...start, x: start.x + dx, y: start.y + dy }
        : { ...start, w: start.w + dx, h: start.h + dy });
      if (el) Object.assign(el.style, { left: `${next.x}%`, top: `${next.y}%`, width: `${next.w}%`, height: `${next.h}%` });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // Onto another item of its layer: a move lands in the nearest free
      // spot, a resize stops as large as it can get; back where it was when
      // neither works.
      const others = sameLayerRects(item.id, item.layer);
      const landed = (mode === "move" ? nearestFit(next, others) : largestFit(next, start, others)) ?? start;
      if (el) Object.assign(el.style, { left: `${landed.x}%`, top: `${landed.y}%`, width: `${landed.w}%`, height: `${landed.h}%` });
      onChange({ ...layout, rects: { ...layout.rects, [item.id]: landed } });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="free-stage" ref={areaRef}>
        {items.map((it) => {
          const r = layout.rects[it.id] ?? placed[it.id];
          if (!r) return null;
          return (
            <div
              key={it.id}
              className={`free-item free-item--${it.layer}`}
              data-free-id={it.id}
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, zIndex: it.layer === layout.top ? 2 : 1 }}
              onPointerDown={(e) => startDrag(e, it, "move")}
            >
              {it.node}
              <span
                className="free-item-resize"
                role="presentation"
                onPointerDown={(e) => startDrag(e, it, "resize")}
              />
            </div>
          );
        })}
    </div>
  );
}
