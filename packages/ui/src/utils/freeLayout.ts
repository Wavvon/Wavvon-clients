// Free layout on the voice stage (decisions.md, "Free layout on the voice
// stage, mirrored by a picture-in-picture window"): every stage item has a
// rectangle in percent of the stage, on one of two layers. Items on the same
// layer never overlap; a camera may overlap a live.

export interface Rect { x: number; y: number; w: number; h: number }
export type Layer = "lives" | "people";

export interface FreeLayout {
  mode: "grid" | "free";
  /** The layer drawn above the other. */
  top: Layer;
  rects: Record<string, Rect>;
}

const KEY = "wavvon:voice-stage-free";
export const LIVES_ITEM = "__lives";

export function loadFreeLayout(): FreeLayout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<FreeLayout> | null;
    if (v && typeof v === "object") {
      return { mode: v.mode === "free" ? "free" : "grid", top: v.top === "lives" ? "lives" : "people", rects: v.rects ?? {} };
    }
  } catch { /* not remembered */ }
  return { mode: "grid", top: "people", rects: {} };
}

export function saveFreeLayout(l: FreeLayout): void {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* not remembered */ }
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function clampRect(r: Rect): Rect {
  const w = Math.min(100, Math.max(10, r.w));
  const h = Math.min(100, Math.max(10, r.h));
  return { w, h, x: Math.min(100 - w, Math.max(0, r.x)), y: Math.min(100 - h, Math.max(0, r.y)) };
}

/** Whether `r` fits among the other rectangles of its layer. */
export function fits(r: Rect, sameLayer: Rect[]): boolean {
  return sameLayer.every((o) => !overlaps(r, o));
}

/** The first free spot for a new item, scanning top-left to bottom-right;
 *  null when its layer has no room left. */
export function placeNew(size: { w: number; h: number }, sameLayer: Rect[]): Rect | null {
  for (let y = 0; y + size.h <= 100; y += 5) {
    for (let x = 0; x + size.w <= 100; x += 5) {
      const r = { x, y, ...size };
      if (fits(r, sameLayer)) return r;
    }
  }
  return null;
}
