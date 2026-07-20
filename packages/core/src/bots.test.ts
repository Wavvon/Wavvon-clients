import { describe, it, expect } from "vitest";
import { toggleBotCapability, parseGameLaunchCard } from "./bots";

describe("toggleBotCapability", () => {
  it("adds a capability not yet granted", () => {
    expect(toggleBotCapability(["can_speak_voice"], "can_use_interactive_ui", true)).toEqual([
      "can_speak_voice",
      "can_use_interactive_ui",
    ]);
  });

  it("removes a granted capability", () => {
    expect(toggleBotCapability(["can_speak_voice", "can_use_interactive_ui"], "can_speak_voice", false)).toEqual([
      "can_use_interactive_ui",
    ]);
  });

  it("is a no-op enabling an already-granted capability", () => {
    expect(toggleBotCapability(["can_speak_voice"], "can_speak_voice", true)).toEqual(["can_speak_voice"]);
  });

  it("is a no-op disabling a capability that was never granted", () => {
    expect(toggleBotCapability(["can_speak_voice"], "can_use_camera", false)).toEqual(["can_speak_voice"]);
  });

  it("does not mutate the input array", () => {
    const granted = ["can_speak_voice"];
    toggleBotCapability(granted, "can_use_camera", true);
    expect(granted).toEqual(["can_speak_voice"]);
  });
});

describe("parseGameLaunchCard", () => {
  it("parses a full card", () => {
    expect(
      parseGameLaunchCard({
        entry_url: "https://bot.example/ttt",
        name: "Tic-Tac-Toe",
        description: "1v1",
        thumbnail_url: "https://bot.example/thumb.png",
      }),
    ).toEqual({
      entry_url: "https://bot.example/ttt",
      name: "Tic-Tac-Toe",
      description: "1v1",
      thumbnail_url: "https://bot.example/thumb.png",
    });
  });

  it("parses a minimal card, filling optional fields with null", () => {
    expect(parseGameLaunchCard({ entry_url: "https://bot.example/ttt", name: "Tic-Tac-Toe" })).toEqual({
      entry_url: "https://bot.example/ttt",
      name: "Tic-Tac-Toe",
      description: null,
      thumbnail_url: null,
    });
  });

  it("rejects a missing entry_url", () => {
    expect(parseGameLaunchCard({ name: "Tic-Tac-Toe" })).toBeNull();
  });

  it("rejects a missing name", () => {
    expect(parseGameLaunchCard({ entry_url: "https://bot.example/ttt" })).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parseGameLaunchCard(null)).toBeNull();
    expect(parseGameLaunchCard(undefined)).toBeNull();
    expect(parseGameLaunchCard("not an object")).toBeNull();
  });

  it("ignores non-string optional fields", () => {
    expect(
      parseGameLaunchCard({ entry_url: "https://bot.example/ttt", name: "T", description: 42 }),
    ).toEqual({
      entry_url: "https://bot.example/ttt",
      name: "T",
      description: null,
      thumbnail_url: null,
    });
  });
});
