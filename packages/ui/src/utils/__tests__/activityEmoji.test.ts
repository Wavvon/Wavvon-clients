import { describe, it, expect } from "vitest";
import { insertAtLineStart } from "../activityEmoji";

describe("insertAtLineStart", () => {
  it("inserts at the start of an empty field", () => {
    expect(insertAtLineStart("", 0, "🎮 ", 500)).toEqual({ text: "🎮 ", cursorPos: 3 });
  });

  it("inserts at the start of the line when the cursor is mid-line", () => {
    const text = "line1\nplaying chess\nline3";
    const cursor = text.indexOf("chess");
    const result = insertAtLineStart(text, cursor, "🎮 ", 500);
    expect(result?.text).toBe("line1\n🎮 playing chess\nline3");
  });

  it("inserts at the line start when the cursor is already there", () => {
    const text = "line1\nline2";
    const lineStart = text.indexOf("line2");
    const result = insertAtLineStart(text, lineStart, "🎮 ", 500);
    expect(result?.text).toBe("line1\n🎮 line2");
    expect(result?.cursorPos).toBe(lineStart + 3);
  });

  it("prepends a second emoji without deduping when the line already has one", () => {
    const text = "🎮 playing chess";
    const result = insertAtLineStart(text, text.length, "🕹️ ", 500);
    expect(result?.text).toBe("🕹️ 🎮 playing chess");
  });

  it("returns null instead of exceeding the max length", () => {
    const text = "a".repeat(10);
    expect(insertAtLineStart(text, 0, "🎮 ", 10)).toBeNull();
  });
});
