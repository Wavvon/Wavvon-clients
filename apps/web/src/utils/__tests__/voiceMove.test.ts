import { describe, it, expect } from "vitest";
import { decideVoiceMove, moveChannelOptions } from "../voiceMove";
import type { Channel } from "../../types";

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "chan-1",
    name: "General",
    created_by: "abc",
    parent_id: null,
    is_category: false,
    display_order: 0,
    description: null,
    icon: null,
    color: null,
    custom_icon_svg: null,
    created_at: 0,
    ...overrides,
  };
}

describe("decideVoiceMove", () => {
  it("ignores a push with no destination channel", () => {
    expect(decideVoiceMove({})).toEqual({ kind: "ignore" });
  });

  it("auto-accepts and carries the pushed name and source through untouched", () => {
    const decision = decideVoiceMove({
      target_channel_id: "chan-2",
      target_channel_name: "Squad Alpha",
      source_channel_id: "chan-1",
      auto: true,
    });
    expect(decision).toEqual({
      kind: "auto",
      targetChannelId: "chan-2",
      targetChannelName: "Squad Alpha",
      sourceChannelId: "chan-1",
    });
  });

  it("prompts when auto is false (generic right-click move, no event context)", () => {
    const decision = decideVoiceMove({
      target_channel_id: "chan-2",
      target_channel_name: "Squad Alpha",
      source_channel_id: null,
      auto: false,
    });
    expect(decision.kind).toBe("prompt");
  });

  it("falls back to a placeholder name rather than looking the channel up locally", () => {
    const decision = decideVoiceMove({ target_channel_id: "chan-2", auto: true });
    expect(decision).toMatchObject({ targetChannelName: "?", sourceChannelId: null });
  });
});

describe("moveChannelOptions", () => {
  it("excludes categories, banner channels, and spawner channels", () => {
    const channels: Channel[] = [
      makeChannel({ id: "cat-1", is_category: true, name: "Category" }),
      makeChannel({ id: "banner-1", channel_type: "banner", name: "Banner" }),
      makeChannel({ id: "spawner-1", channel_type: "spawner", name: "Spawner" }),
      makeChannel({ id: "voice-1", name: "Voice Room" }),
    ];
    expect(moveChannelOptions(channels)).toEqual([{ id: "voice-1", name: "Voice Room" }]);
  });

  it("returns an empty list when there are no eligible channels", () => {
    expect(moveChannelOptions([makeChannel({ is_category: true })])).toEqual([]);
  });
});
