import { describe, it, expect, vi } from "vitest";

const calls: string[] = [];
vi.mock("../http", () => ({
  hubFetch: async (path: string) => {
    calls.push(path);
    if (path.endsWith("/vote")) return new Response(null, { status: 204 });
    return new Response(
      JSON.stringify({
        id: "p1",
        channel_id: "c1",
        creator_pubkey: "abc",
        question: "Which night?",
        options: JSON.stringify([{ id: "a", text: "Thu" }, { id: "b", text: "Fri" }]),
        ends_at: null,
        max_choices: 1,
        created_at: 1,
        totals: { a: 1, b: 2 },
        your_vote: ["b"],
      }),
    );
  },
}));

import { votePoll } from "../commands/polls";

// GET /polls/:id flattens the poll into the body (PollWithTotals). The client
// read it from a nested `poll` key, so every vote landed on the hub and then
// threw "Cannot read properties of undefined (reading 'options')" in the UI.
describe("votePoll", () => {
  it("reshapes the flat GET /polls/:id body into a Poll", async () => {
    const poll = await votePoll("p1", "b");
    expect(poll.total_votes).toBe(3);
    expect(poll.options).toEqual([
      { id: "a", text: "Thu", vote_count: 1, voted: false },
      { id: "b", text: "Fri", vote_count: 2, voted: true },
    ]);
  });
});
