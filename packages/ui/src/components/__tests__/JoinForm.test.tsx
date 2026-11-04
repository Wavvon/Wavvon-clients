import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JoinForm, isAnswered } from "../JoinForm";
import type { Survey, SurveyQuestion } from "../../types";

const q = (over: Partial<SurveyQuestion>): SurveyQuestion => ({
  id: "q", prompt: "P", kind: "text", required: true, display_order: 1, ...over,
});

describe("JoinForm answers", () => {
  // A consent counts only when checked: an unchecked box is the joiner saying
  // no, and the hub refuses it anyway.
  it("counts a consent only when checked", () => {
    const c = q({ kind: "consent" });
    expect(isAnswered(c, { question_id: "q", checked: true })).toBe(true);
    expect(isAnswered(c, { question_id: "q", checked: false })).toBe(false);
  });

  it("counts a multi with at least one choice, a text with more than blanks", () => {
    expect(isAnswered(q({ kind: "multi" }), { question_id: "q", choice_ids: [] })).toBe(false);
    expect(isAnswered(q({ kind: "multi" }), { question_id: "q", choice_ids: ["a"] })).toBe(true);
    expect(isAnswered(q({ kind: "text" }), { question_id: "q", text_answer: "  " })).toBe(false);
  });
});

describe("JoinForm rendering", () => {
  const form: Survey = {
    id: "f",
    questions: [
      q({ id: "adult", kind: "consent", prompt: "I am an adult", display_order: 2 }),
      q({ id: "how", kind: "text", prompt: "How?", multiline: false, display_order: 1 }),
      q({
        id: "games", kind: "multi", prompt: "Games", required: false, display_order: 3,
        choices: [{ id: "a", label: "A", display_order: 1 }, { id: "b", label: "B", display_order: 2 }],
      }),
    ],
  };
  const html = renderToStaticMarkup(<JoinForm form={form} submitting={false} onSubmit={() => {}} />);

  it("renders each kind with its control, in display order", () => {
    expect(html.indexOf("How?")).toBeLessThan(html.indexOf("I am an adult"));
    expect(html).toContain('type="text"');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
  });

  it("holds the submit back until the required questions are answered", () => {
    expect(html).toMatch(/<button disabled="">survey\.modal\.submit<\/button>/);
  });
});
