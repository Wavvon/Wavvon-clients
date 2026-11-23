import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { clampRect, fits, placeNew, type FreeLayout, type Layer, type Rect } from "../../utils/freeLayout";

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
  const { t } = useTranslation();
  const areaRef = useRef<HTMLDivElement>(null);

  // A new item takes the first free spot on its layer.
  const missing = items.filter((it) => !layout.rects[it.id]);
  const noRoom: FreeItem[] = [];
  const placed: Record<string, Rect> = {};
  for (const it of missing) {
    const sameLayer = items
      .filter((o) => o.layer === it.layer && o.id !== it.id)
      .map((o) => layout.rects[o.id] ?? placed[o.id])
      .filter((r): r is Rect => !!r);
    const spot = placeNew(DEFAULT_SIZE[it.layer], sameLayer);
    if (spot) placed[it.id] = spot;
    else noRoom.push(it);
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
      if (fits(next, sameLayerRects(item.id, item.layer))) {
        onChange({ ...layout, rects: { ...layout.rects, [item.id]: next } });
      } else if (el) {
        // Same layer, overlapping: snap back to where it was.
        Object.assign(el.style, { left: `${start.x}%`, top: `${start.y}%`, width: `${start.w}%`, height: `${start.h}%` });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <>
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
      {noRoom.length > 0 && (
        <p className="muted hint-fine">{t("voice.stage.free_no_room", { count: noRoom.length })}</p>
      )}
    </>
  );
}
