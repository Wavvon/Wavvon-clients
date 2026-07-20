import { describe, it, expect } from "vitest";
import type { Channel } from "@wavvon/core";
import type { EventSlot } from "../../types";
import {
  announcementChannelCandidates,
  buildSlotClaimPayload,
  buildSlotUnclaimPayload,
  canClaimSlot,
  channelHasDescendants,
  defaultAnnouncementChannelId,
  isClaimedByMe,
  isSlotFull,
  reminderMinutesToOffset,
  reminderOffsetToMinutes,
} from "../events";

function makeSlot(overrides: Partial<EventSlot> = {}): EventSlot {
  return {
    id: "slot-1",
    name: "Tank",
    capacity: 2,
    position: 0,
    claimed: 0,
    claimants: [],
    ...overrides,
  };
}

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

describe("reminderOffsetToMinutes", () => {
  it("maps off to null", () => {
    expect(reminderOffsetToMinutes("off")).toBeNull();
  });

  it("maps 15m/1h/24h to their minute counts", () => {
    expect(reminderOffsetToMinutes("15m")).toBe(15);
    expect(reminderOffsetToMinutes("1h")).toBe(60);
    expect(reminderOffsetToMinutes("24h")).toBe(1440);
  });
});

describe("reminderMinutesToOffset", () => {
  it("round-trips every fixed offset", () => {
    expect(reminderMinutesToOffset(null)).toBe("off");
    expect(reminderMinutesToOffset(15)).toBe("15m");
    expect(reminderMinutesToOffset(60)).toBe("1h");
    expect(reminderMinutesToOffset(1440)).toBe("24h");
  });

  it("treats undefined the same as null", () => {
    expect(reminderMinutesToOffset(undefined)).toBe("off");
  });

  it("falls back to off for a value set by another client", () => {
    expect(reminderMinutesToOffset(45)).toBe("off");
  });
});

describe("isSlotFull", () => {
  it("is never full when capacity is unlimited", () => {
    expect(isSlotFull(makeSlot({ capacity: null, claimed: 500 }))).toBe(false);
  });

  it("is full once claimed reaches capacity", () => {
    expect(isSlotFull(makeSlot({ capacity: 2, claimed: 2 }))).toBe(true);
    expect(isSlotFull(makeSlot({ capacity: 2, claimed: 1 }))).toBe(false);
  });
});

describe("isClaimedByMe", () => {
  it("is false with no pubkey", () => {
    expect(isClaimedByMe(makeSlot({ claimants: ["abc"] }), null)).toBe(false);
  });

  it("is true when my pubkey is among the claimants", () => {
    expect(isClaimedByMe(makeSlot({ claimants: ["abc", "def"] }), "def")).toBe(true);
  });

  it("is false when my pubkey isn't among the claimants", () => {
    expect(isClaimedByMe(makeSlot({ claimants: ["abc"] }), "def")).toBe(false);
  });
});

describe("canClaimSlot", () => {
  it("allows claiming an unfull slot", () => {
    const slot = makeSlot({ capacity: 2, claimed: 1, claimants: ["abc"] });
    expect(canClaimSlot(slot, "def")).toBe(true);
  });

  it("blocks claiming a full slot", () => {
    const slot = makeSlot({ capacity: 2, claimed: 2, claimants: ["abc", "ghi"] });
    expect(canClaimSlot(slot, "def")).toBe(false);
  });

  it("still allows keeping your own claim on an otherwise-full slot", () => {
    const slot = makeSlot({ capacity: 2, claimed: 2, claimants: ["abc", "def"] });
    expect(canClaimSlot(slot, "def")).toBe(true);
  });

  it("always allows claiming an unlimited slot", () => {
    const slot = makeSlot({ capacity: null, claimed: 50, claimants: [] });
    expect(canClaimSlot(slot, "def")).toBe(true);
  });
});

describe("slot rsvp payload builders", () => {
  it("builds a claim payload carrying the slot id", () => {
    expect(buildSlotClaimPayload("slot-1")).toEqual({ status: "going", slot_id: "slot-1" });
  });

  it("builds an unclaim payload with no slot id", () => {
    expect(buildSlotUnclaimPayload()).toEqual({ status: "going" });
  });
});

describe("channelHasDescendants", () => {
  it("is false for a channel with no id", () => {
    expect(channelHasDescendants([makeChannel()], null)).toBe(false);
  });

  it("is false when nothing has this channel as parent", () => {
    const channels = [makeChannel({ id: "a" }), makeChannel({ id: "b", parent_id: null })];
    expect(channelHasDescendants(channels, "a")).toBe(false);
  });

  it("is true when at least one channel has this channel as parent", () => {
    const channels = [makeChannel({ id: "a" }), makeChannel({ id: "b", parent_id: "a" })];
    expect(channelHasDescendants(channels, "a")).toBe(true);
  });

  it("is true through a grandchild (any descendant implies a direct child)", () => {
    const channels = [
      makeChannel({ id: "a" }),
      makeChannel({ id: "b", parent_id: "a" }),
      makeChannel({ id: "c", parent_id: "b" }),
    ];
    expect(channelHasDescendants(channels, "a")).toBe(true);
  });
});

describe("announcementChannelCandidates", () => {
  it("excludes categories and temp rooms", () => {
    const channels = [
      makeChannel({ id: "cat", is_category: true }),
      makeChannel({ id: "temp", is_temporary: true }),
      makeChannel({ id: "keep" }),
    ];
    expect(announcementChannelCandidates(channels).map((c) => c.id)).toEqual(["keep"]);
  });
});

describe("defaultAnnouncementChannelId", () => {
  it("prefers a banner channel", () => {
    const channels = [
      makeChannel({ id: "general" }),
      makeChannel({ id: "banner-1", channel_type: "banner", name: "Community" }),
    ];
    expect(defaultAnnouncementChannelId(channels, "general")).toBe("banner-1");
  });

  it("falls back to a channel literally named announcements", () => {
    const channels = [
      makeChannel({ id: "general" }),
      makeChannel({ id: "ann-1", name: "announcements" }),
    ];
    expect(defaultAnnouncementChannelId(channels, "general")).toBe("ann-1");
  });

  it("falls back to the given channel id when nothing matches", () => {
    const channels = [makeChannel({ id: "general" })];
    expect(defaultAnnouncementChannelId(channels, "general")).toBe("general");
  });

  it("ignores a banner channel that is a category or temp room", () => {
    const channels = [
      makeChannel({ id: "general" }),
      makeChannel({ id: "banner-cat", channel_type: "banner", is_category: true }),
    ];
    expect(defaultAnnouncementChannelId(channels, "general")).toBe("general");
  });
});
