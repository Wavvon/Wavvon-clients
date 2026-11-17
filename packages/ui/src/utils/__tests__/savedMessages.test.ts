import { describe, expect, it } from "vitest";
import { markSavedDeleted, parseSaved, toggleSaved, type SavedMessage } from "../savedMessages";

const entry = (id: string, at: number): SavedMessage => ({
  hub_id: "h", hub_url: "https://h", channel_id: "c", message_id: id, excerpt: "x".repeat(300), saved_at: at,
});

describe("savedMessages", () => {
  it("saves newest first, trims the excerpt, and toggles off", () => {
    let l = toggleSaved([], entry("a", 1));
    l = toggleSaved(l, entry("b", 2));
    expect(l.map((s) => s.message_id)).toEqual(["b", "a"]);
    expect(l[0].excerpt).toHaveLength(200);
    expect(toggleSaved(l, entry("a", 3)).map((s) => s.message_id)).toEqual(["b"]);
  });

  it("marks a deleted message instead of dropping it", () => {
    const l = markSavedDeleted([entry("a", 1)], "h", "a");
    expect(l).toHaveLength(1);
    expect(l[0].deleted).toBe(true);
    expect(markSavedDeleted(l, "h", "zz")).toBe(l);
  });

  it("ignores junk in storage", () => {
    expect(parseSaved("not json")).toEqual([]);
    expect(parseSaved(JSON.stringify([{ hub_id: 1 }, entry("a", 1)]))).toHaveLength(1);
  });
});
