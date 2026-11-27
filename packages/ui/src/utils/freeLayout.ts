// Free layout on the voice stage (decisions.md, "Free layout on the voice
// stage, mirrored by a picture-in-picture window"): every stage item has a
// rectangle in percent of the stage, on one of two layers. Items on the same
// layer never overlap; a camera may overlap a live.

export interface Rect { x: number; y: number; w: number; h: number }
export type Layer = "lives" | "people";

/** The helpers that line items up, each the member's own choice. */
export interface FreeTools {
  /** Positions and sizes round to a grid of `cols` columns (rows = cols / 2). */
  snap: boolean;
  cols: number;
  /** A resize keeps the item's shape. */
  keepRatio: boolean;
  /** Edges and centres snap to other items and to the stage. */
  guides: boolean;
  /** How much larger a live is than a person when arranging (1 = same size). */
  liveScale: number;
}

export const DEFAULT_TOOLS: FreeTools = { snap: true, cols: 24, keepRatio: true, guides: true, liveScale: 2 };

export interface FreeLayout {
  mode: "grid" | "free";
  /** The layer drawn above the other. */
  top: Layer;
  rects: Record<string, Rect>;
  tools: FreeTools;
}

const KEY = "wavvon:voice-stage-free";
export const LIVES_ITEM = "__lives";
/** Your own share: its own item, so it moves apart from the lives you watch. */
export const SELF_SHARE_ITEM = "__self_share";

export function loadFreeLayout(): FreeLayout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<FreeLayout> | null;
    if (v && typeof v === "object") {
      return { mode: v.mode === "free" ? "free" : "grid", top: v.top === "lives" ? "lives" : "people", rects: v.rects ?? {}, tools: { ...DEFAULT_TOOLS, ...v.tools } };
    }
  } catch { /* not remembered */ }
  return { mode: "grid", top: "people", rects: {}, tools: DEFAULT_TOOLS };
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

/** The free spot of the same size closest to where `r` was dropped, so a
 *  drop onto another item slides beside it instead of being refused; null
 *  when the layer has no room for that size anywhere. */
export function nearestFit(r: Rect, sameLayer: Rect[]): Rect | null {
  if (fits(r, sameLayer)) return r;
  let best: Rect | null = null;
  let bestDist = Infinity;
  for (let y = 0; y + r.h <= 100; y += 1) {
    for (let x = 0; x + r.w <= 100; x += 1) {
      const d = (x - r.x) ** 2 + (y - r.y) ** 2;
      if (d >= bestDist) continue;
      const c = { ...r, x, y };
      if (fits(c, sameLayer)) { best = c; bestDist = d; }
    }
  }
  return best;
}

/** A resize pulled over another item: as large as it can get from the same
 *  corner without overlapping, never smaller than it started; null when even
 *  `start` no longer fits. */
export function largestFit(r: Rect, start: Rect, sameLayer: Rect[]): Rect | null {
  if (fits(r, sameLayer)) return r;
  let best: Rect | null = null;
  for (let w = r.w; w >= Math.min(start.w, r.w); w -= 1) {
    for (let h = r.h; h >= Math.min(start.h, r.h); h -= 1) {
      if (best && w * h <= best.w * best.h) break;
      const c = { ...r, w, h };
      if (fits(c, sameLayer)) { best = c; break; }
    }
  }
  return best;
}

const round = (v: number, step: number) => Math.round(v / step) * step;

/** Rounds a rectangle to the grid: `cols` columns and half as many rows,
 *  never below the stage's minimum item size, in whole cells. */
export function snapToGrid(r: Rect, cols: number): Rect {
  const sx = 100 / cols;
  const sy = 100 / Math.max(1, Math.round(cols / 2));
  return clampRect({
    x: round(r.x, sx),
    y: round(r.y, sy),
    w: Math.max(Math.ceil(10 / sx) * sx, round(r.w, sx)),
    h: Math.max(Math.ceil(10 / sy) * sy, round(r.h, sy)),
  });
}

/** Lines to draw while a guide holds an item: x positions and y positions, in percent. */
export interface Guides { x: number[]; y: number[] }

function nearest(values: number[], targets: number[], within: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= within && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  }
  return best;
}

/** Magnetic guides, as in a drawing tool. A move snaps the item's left,
 *  centre or right (top, middle, bottom) to the same lines of the others or
 *  of the stage; a resize snaps the far edges, and the size to another
 *  item's. `within` is the pull, in percent. */
export function applyGuides(r: Rect, others: Rect[], mode: "move" | "resize", within: number): { rect: Rect; guides: Guides } {
  const xs = [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const ys = [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const out = { ...r };
  const guides: Guides = { x: [], y: [] };
  if (mode === "move") {
    const gx = nearest([r.x, r.x + r.w / 2, r.x + r.w], xs, within);
    if (gx) { out.x += gx.delta; guides.x.push(gx.at); }
    const gy = nearest([r.y, r.y + r.h / 2, r.y + r.h], ys, within);
    if (gy) { out.y += gy.delta; guides.y.push(gy.at); }
  } else {
    const gx = nearest([r.x + r.w], xs, within);
    const sw = nearest([r.w], others.map((o) => o.w), within);
    if (sw && (!gx || Math.abs(sw.delta) <= Math.abs(gx.delta))) out.w += sw.delta;
    else if (gx) { out.w += gx.delta; guides.x.push(gx.at); }
    const gy = nearest([r.y + r.h], ys, within);
    const sh = nearest([r.h], others.map((o) => o.h), within);
    if (sh && (!gy || Math.abs(sh.delta) <= Math.abs(gy.delta))) out.h += sh.delta;
    else if (gy) { out.h += gy.delta; guides.y.push(gy.at); }
  }
  return { rect: out, guides };
}

/** Height for a width so the item keeps `ratio` (width / height in pixels)
 *  on a stage of `stageRatio` (its width / height in pixels). */
export function heightForRatio(w: number, ratio: number, stageRatio: number): number {
  return (w * stageRatio) / ratio;
}

/** Lays every item out in rows, lives first, a live `liveScale` times a
 *  person on each side. Picks the column count that leaves the cells
 *  closest to square on this stage. */
export function arrange(items: { id: string; layer: Layer }[], liveScale: number, stageRatio: number): Record<string, Rect> {
  const scale = Math.max(1, Math.round(liveScale));
  const units = [...items].sort((a, b) => (a.layer === b.layer ? 0 : a.layer === "lives" ? -1 : 1))
    .map((it) => ({ id: it.id, s: it.layer === "lives" ? scale : 1 }));
  if (units.length === 0) return {};
  let best: { rects: Record<string, Rect>; score: number } | null = null;
  const total = units.reduce((n, u) => n + u.s * u.s, 0);
  for (let cols = scale; cols <= Math.max(scale, total); cols++) {
    const placed: { id: string; c: number; r: number; s: number }[] = [];
    let c = 0;
    let r = 0;
    let rowH = 0;
    for (const u of units) {
      if (c + u.s > cols) { r += rowH; c = 0; rowH = 0; }
      placed.push({ id: u.id, c, r, s: u.s });
      c += u.s;
      rowH = Math.max(rowH, u.s);
    }
    const rows = r + rowH;
    const cellW = 100 / cols;
    const cellH = 100 / rows;
    const score = Math.abs(Math.log((cellW * stageRatio) / cellH));
    if (!best || score < best.score) {
      best = {
        score,
        rects: Object.fromEntries(placed.map((p) => [p.id, { x: p.c * cellW, y: p.r * cellH, w: p.s * cellW, h: p.s * cellH }])),
      };
    }
  }
  return best!.rects;
}
