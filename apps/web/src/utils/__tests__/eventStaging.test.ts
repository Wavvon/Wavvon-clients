import { describe, it, expect } from "vitest";
import { buildStagingGroups, claimantVoiceStatus, unassignedGoingPubkeys } from "../eventStaging";
import type { EventMoveAssignment, EventRsvp, EventSlot, VoiceParticipant } from "../../types";

function makeSlot(overrides: Partial<EventSlot> = {}): EventSlot {
  return { id: "slot-1", name: "Tank", capacity: 2, position: 0, claimed: 1, claimants: ["pk-1"], ...overrides };
}

describe("unassignedGoingPubkeys", () => {
  it("returns pubkeys with a plain going RSVP and no slot claim", () => {
    const rsvps: EventRsvp[] = [
      { pubkey: "pk-1", status: "going" },
      { pubkey: "pk-2", status: "going" },
      { pubkey: "pk-3", status: "maybe" },
    ];
    const slots = [makeSlot({ claimants: ["pk-1"] })];
    expect(unassignedGoingPubkeys(rsvps, slots)).toEqual(["pk-2"]);
  });

  it("returns an empty list when every going RSVP claimed a slot", () => {
    const rsvps: EventRsvp[] = [{ pubkey: "pk-1", status: "going" }];
    const slots = [makeSlot({ claimants: ["pk-1"] })];
    expect(unassignedGoingPubkeys(rsvps, slots)).toEqual([]);
  });
});

describe("claimantVoiceStatus", () => {
  const channelNameById = new Map([
    ["chan-voice", "Squad Alpha"],
    ["chan-assigned", "Squad Bravo"],
  ]);

  it("reports in_voice when the pubkey appears in the voice-participants map", () => {
    const voicePartByChannel: Record<string, VoiceParticipant[]> = {
      "chan-voice": [{ public_key: "pk-1", display_name: "Alice" }],
    };
    const status = claimantVoiceStatus("pk-1", [], voicePartByChannel, channelNameById);
    expect(status).toEqual({ kind: "in_voice", channelName: "Squad Alpha" });
  });

  it("reports assigned when not in voice but a pending assignment exists", () => {
    const assignments: EventMoveAssignment[] = [
      { user_pubkey: "pk-1", target_channel_id: "chan-assigned", assigned_by: "org", created_at: 0 },
    ];
    const status = claimantVoiceStatus("pk-1", assignments, {}, channelNameById);
    expect(status).toEqual({ kind: "assigned", channelName: "Squad Bravo" });
  });

  it("prefers in_voice over a stale assignment for the same pubkey", () => {
    const assignments: EventMoveAssignment[] = [
      { user_pubkey: "pk-1", target_channel_id: "chan-assigned", assigned_by: "org", created_at: 0 },
    ];
    const voicePartByChannel: Record<string, VoiceParticipant[]> = {
      "chan-voice": [{ public_key: "pk-1", display_name: "Alice" }],
    };
    const status = claimantVoiceStatus("pk-1", assignments, voicePartByChannel, channelNameById);
    expect(status).toEqual({ kind: "in_voice", channelName: "Squad Alpha" });
  });

  it("falls back to none with no voice presence and no assignment", () => {
    expect(claimantVoiceStatus("pk-1", [], {}, channelNameById)).toEqual({ kind: "none" });
  });

  it("falls back to a placeholder name for an unknown channel id", () => {
    const voicePartByChannel: Record<string, VoiceParticipant[]> = {
      "chan-unknown": [{ public_key: "pk-1", display_name: null }],
    };
    expect(claimantVoiceStatus("pk-1", [], voicePartByChannel, channelNameById)).toEqual({
      kind: "in_voice",
      channelName: "?",
    });
  });
});

describe("buildStagingGroups", () => {
  it("orders slots by position and appends the unassigned bucket last", () => {
    const slots = [
      makeSlot({ id: "slot-2", name: "DPS", position: 1, claimants: ["pk-2"] }),
      makeSlot({ id: "slot-1", name: "Tank", position: 0, claimants: ["pk-1"] }),
    ];
    const groups = buildStagingGroups(slots, ["pk-3"]);
    expect(groups.map((g) => g.id)).toEqual(["slot-1", "slot-2", null]);
    expect(groups[2].claimants).toEqual(["pk-3"]);
  });

  it("omits the unassigned bucket entirely when there are no unassigned claimants", () => {
    const groups = buildStagingGroups([makeSlot()], []);
    expect(groups).toHaveLength(1);
  });
});
