import { describe, it, expect } from "vitest";
import { mergeOlderPage } from "../useOlderPages";

const m = (id: string) => ({ id });

describe("scrollback page merge", () => {
  it("puts the older page in front, oldest first", () => {
    const r = mergeOlderPage([m("c"), m("d")], [m("a"), m("b")], 2);
    expect(r.items.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.hasMore).toBe(true);
  });

  // A short page is the start of the channel; asking again would only return
  // nothing, every time the reader touches the top.
  it("reads a short page as the start of history", () => {
    expect(mergeOlderPage([m("c")], [m("b")], 2).hasMore).toBe(false);
    expect(mergeOlderPage([m("c")], [], 2).hasMore).toBe(false);
  });

  // A message posted while the page was in flight shifts the hub's window by
  // one, so the page can repeat a message already held.
  it("drops ids already held", () => {
    const r = mergeOlderPage([m("b"), m("c")], [m("a"), m("b")], 2);
    expect(r.items.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
