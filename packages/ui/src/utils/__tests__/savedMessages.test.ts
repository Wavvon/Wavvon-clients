import { describe, expect, it } from "vitest";
import {
  dismissReminder, dueReminders, markReminded, markSavedDeleted, parseSaved, remindDeadline, setReminder, toggleSaved,
  type SavedMessage,
} from "../savedMessages";

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

describe("reminders", () => {
  it("adds a reminder-only entry that dismissing drops, and keeps a saved one", () => {
    let l = setReminder([], entry("a", 1), 1000);
    expect(l[0].remind_only).toBe(true);
    expect(dismissReminder(l, "h:a")).toEqual([]);
    l = toggleSaved(l, entry("a", 2));
    expect(l).toHaveLength(1);
    expect(l[0].remind_only).toBe(false);
    expect(dismissReminder(l, "h:a")[0].remind_at).toBeUndefined();
  });

  it("finds due reminders once and the next one ahead", () => {
    let l = setReminder(setReminder([], entry("a", 1), 100), entry("b", 1), 300);
    const { due, next } = dueReminders(l, 200);
    expect(due.map((s) => s.message_id)).toEqual(["a"]);
    expect(next).toBe(300);
    l = markReminded(l, new Set(["h:a"]));
    expect(dueReminders(l, 200).due).toEqual([]);
  });

  it("puts tomorrow at 09:00", () => {
    expect(new Date(remindDeadline("tomorrow", new Date(2026, 0, 31, 23, 0)))).toEqual(new Date(2026, 1, 1, 9, 0));
  });
});
