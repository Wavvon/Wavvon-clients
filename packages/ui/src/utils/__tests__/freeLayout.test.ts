import { describe, it, expect } from "vitest";
import { clampRect, fits, largestFit, nearestFit, overlaps, placeNew } from "../freeLayout";

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
