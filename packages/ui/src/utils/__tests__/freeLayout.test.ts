import { describe, it, expect } from "vitest";
import { applyGuides, arrange, clampRect, fits, heightForRatio, largestFit, nearestFit, overlaps, placeNew, snapToGrid } from "../freeLayout";

describe("free stage layout", () => {
  it("tells overlapping rectangles from touching ones", () => {
    expect(overlaps({ x: 0, y: 0, w: 50, h: 50 }, { x: 25, y: 25, w: 50, h: 50 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 50, h: 50 }, { x: 50, y: 0, w: 50, h: 50 })).toBe(false);
  });

  it("keeps a rectangle inside the stage", () => {
    expect(clampRect({ x: 90, y: -5, w: 30, h: 30 })).toEqual({ x: 70, y: 0, w: 30, h: 30 });
  });

  it("places a new item in the first free spot of its layer", () => {
    const taken = [{ x: 0, y: 0, w: 50, h: 50 }];
    expect(placeNew({ w: 50, h: 50 }, taken)).toEqual({ x: 50, y: 0, w: 50, h: 50 });
  });

  it("says when a layer has no room left", () => {
    expect(placeNew({ w: 60, h: 60 }, [{ x: 0, y: 0, w: 100, h: 100 }])).toBeNull();
  });

  it("only same-layer items block a spot", () => {
    expect(fits({ x: 0, y: 0, w: 40, h: 40 }, [])).toBe(true);
    expect(fits({ x: 0, y: 0, w: 40, h: 40 }, [{ x: 10, y: 10, w: 10, h: 10 }])).toBe(false);
  });
});

describe("dropping onto another item", () => {
  const other = { x: 40, y: 0, w: 40, h: 100 };
  it("slides to the nearest free spot instead of refusing", () => {
    expect(nearestFit({ x: 30, y: 10, w: 20, h: 20 }, [other])).toEqual({ x: 20, y: 10, w: 20, h: 20 });
  });
  it("keeps a drop that already fits", () => {
    const r = { x: 0, y: 0, w: 20, h: 20 };
    expect(nearestFit(r, [other])).toBe(r);
  });
  it("finds nothing when the size fits nowhere", () => {
    expect(nearestFit({ x: 0, y: 0, w: 70, h: 20 }, [other])).toBeNull();
  });
});

describe("resizing over another item", () => {
  const other = { x: 50, y: 0, w: 50, h: 100 };
  const start = { x: 0, y: 0, w: 30, h: 30 };
  it("stops at the largest size that does not overlap", () => {
    expect(largestFit({ x: 0, y: 0, w: 70, h: 60 }, start, [other])).toEqual({ x: 0, y: 0, w: 50, h: 60 });
  });
  it("keeps a resize that already fits", () => {
    const r = { x: 0, y: 0, w: 40, h: 40 };
    expect(largestFit(r, start, [other])).toBe(r);
  });
});

describe("lining items up", () => {
  it("rounds to the grid, never below the minimum size", () => {
    // 24 columns (step 100/24), 12 rows (step 100/12).
    const r = snapToGrid({ x: 9, y: 9, w: 1, h: 30 }, 24);
    expect(r.x).toBeCloseTo(100 / 24 * 2);
    expect(r.y).toBeCloseTo(100 / 12);
    // 1% asks for less than the 10% minimum: three whole columns.
    expect(r.w).toBeCloseTo(100 / 24 * 3);
    expect(r.h).toBeCloseTo(100 / 12 * 4);
  });

  it("pulls a moved edge onto a neighbour's edge and reports the guide", () => {
    const { rect, guides } = applyGuides({ x: 41, y: 20, w: 20, h: 20 }, [{ x: 10, y: 60, w: 30, h: 20 }], "move", 2);
    expect(rect.x).toBe(40);
    expect(guides.x).toEqual([40]);
  });

  it("lets a resize match another item's size", () => {
    const { rect } = applyGuides({ x: 0, y: 0, w: 29, h: 17 }, [{ x: 60, y: 60, w: 30, h: 18 }], "resize", 2);
    expect(rect.w).toBe(30);
    expect(rect.h).toBe(18);
  });

  it("leaves an item alone when nothing is close", () => {
    const r = { x: 21, y: 21, w: 7, h: 7 };
    expect(applyGuides(r, [], "move", 1).rect).toEqual(r);
  });

  it("keeps a 16:9 live 16:9 on a 2:1 stage", () => {
    // 40% of a 2:1 stage is 0.8 heights wide; 16:9 makes it 0.45 heights tall.
    expect(heightForRatio(40, 16 / 9, 2)).toBeCloseTo(45);
  });

  it("arranges lives first, larger, without overlaps", () => {
    const rects = arrange(
      [{ id: "p1", layer: "people" }, { id: "live", layer: "lives" }, { id: "p2", layer: "people" }],
      2,
      16 / 9,
    );
    expect(rects.live.w).toBeCloseTo(rects.p1.w * 2);
    expect(rects.live.x).toBe(0);
    expect(rects.live.y).toBe(0);
    const all = Object.values(rects);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
    }
  });
});
