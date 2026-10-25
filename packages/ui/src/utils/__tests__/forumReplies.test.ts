import { describe, it, expect } from "vitest";
import { mergeReplies } from "../forumReplies";
import type { ReplyView } from "../../types";

const r = (id: string, body = id) => ({ id, body }) as ReplyView;

describe("mergeReplies", () => {
  it("appends unseen replies in order", () => {
    expect(mergeReplies([r("a"), r("b")], [r("c")]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("does not duplicate and refreshes replies seen again", () => {
    const out = mergeReplies([r("a"), r("b")], [r("b", "edited"), r("c")]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(out[1].body).toBe("edited");
  });
});
