import { describe, it, expect } from "vitest";
import { parseGameLaunchCard, noteAppJoin, takeAppJoin } from "./apps";

describe("parseGameLaunchCard", () => {
  it("parses a full card", () => {
    expect(
      parseGameLaunchCard({
        entry_url: "https://app.example/ttt",
        name: "Tic-Tac-Toe",
        description: "1v1",
        thumbnail_url: "https://app.example/thumb.png",
      }),
    ).toEqual({
      entry_url: "https://app.example/ttt",
      name: "Tic-Tac-Toe",
      description: "1v1",
      thumbnail_url: "https://app.example/thumb.png",
    });
  });

  it("parses a minimal card, filling optional fields with null", () => {
    expect(parseGameLaunchCard({ entry_url: "https://app.example/ttt", name: "Tic-Tac-Toe" })).toEqual({
      entry_url: "https://app.example/ttt",
      name: "Tic-Tac-Toe",
      description: null,
      thumbnail_url: null,
    });
  });

  it("rejects a missing entry_url", () => {
    expect(parseGameLaunchCard({ name: "Tic-Tac-Toe" })).toBeNull();
  });

  it("rejects a missing name", () => {
    expect(parseGameLaunchCard({ entry_url: "https://app.example/ttt" })).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parseGameLaunchCard(null)).toBeNull();
    expect(parseGameLaunchCard(undefined)).toBeNull();
    expect(parseGameLaunchCard("not an object")).toBeNull();
  });

  it("ignores non-string optional fields", () => {
    expect(
      parseGameLaunchCard({ entry_url: "https://app.example/ttt", name: "T", description: 42 }),
    ).toEqual({
      entry_url: "https://app.example/ttt",
      name: "T",
      description: null,
      thumbnail_url: null,
    });
  });
});

describe("takeAppJoin", () => {
  it("honours an app_open only once, and only for a recent join", () => {
    expect(takeAppJoin("never-joined", 0)).toBe(false);
    noteAppJoin("a", 1_000);
    expect(takeAppJoin("a", 2_000)).toBe(true);
    expect(takeAppJoin("a", 2_000)).toBe(false);
    noteAppJoin("b", 1_000);
    expect(takeAppJoin("b", 1_000 + 61_000)).toBe(false);
  });
});
