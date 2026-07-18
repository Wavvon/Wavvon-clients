import type { Channel, EventSlot } from "../types";

export type ReminderOffset = "off" | "15m" | "1h" | "24h";

const OFFSET_TO_MINUTES: Record<ReminderOffset, number | null> = {
  off: null,
  "15m": 15,
  "1h": 60,
  "24h": 1440,
};

export const REMINDER_OFFSETS: ReminderOffset[] = ["off", "15m", "1h", "24h"];

export function reminderOffsetToMinutes(offset: ReminderOffset): number | null {
  return OFFSET_TO_MINUTES[offset];
}

// Any minutes value that doesn't match one of the composer's fixed offsets
// (e.g. a value set by another client) falls back to "off" for display.
export function reminderMinutesToOffset(minutes: number | null | undefined): ReminderOffset {
  for (const offset of REMINDER_OFFSETS) {
    if (OFFSET_TO_MINUTES[offset] === (minutes ?? null)) return offset;
  }
  return "off";
}

export function isSlotFull(slot: Pick<EventSlot, "capacity" | "claimed">): boolean {
  return slot.capacity !== null && slot.claimed >= slot.capacity;
}

export function isClaimedByMe(slot: Pick<EventSlot, "claimants">, myPubkey: string | null): boolean {
  return myPubkey !== null && slot.claimants.includes(myPubkey);
}

// Mirrors the hub's capacity check (rsvp_event in events.rs), which excludes
// the caller's own existing claim on that slot — so re-claiming (or keeping)
// your own slot never counts against yourself.
export function canClaimSlot(slot: EventSlot, myPubkey: string | null): boolean {
  if (isClaimedByMe(slot, myPubkey)) return true;
  return !isSlotFull(slot);
}

export interface RsvpSlotPayload {
  status: "going";
  slot_id?: string;
}

export function buildSlotClaimPayload(slotId: string): RsvpSlotPayload {
  return { status: "going", slot_id: slotId };
}

export function buildSlotUnclaimPayload(): RsvpSlotPayload {
  return { status: "going" };
}

// events.md §6: the composer's "Also post in sub-channels" checkbox only
// makes sense when the anchor channel actually has descendants — a channel
// has one the moment it has any direct child (a grandchild implies a child).
export function channelHasDescendants(channels: Channel[], channelId: string | null): boolean {
  if (!channelId) return false;
  return channels.some((c) => c.parent_id === channelId);
}

// Channels eligible as a hub-wide event's "Announcement channel" (events.md
// §5) — categories aren't postable and temp/squad rooms are ephemeral, so
// neither makes a sensible anchor for an event meant to outlive them.
export function announcementChannelCandidates(channels: Channel[]): Channel[] {
  return channels.filter((c) => !c.is_category && !c.is_temporary);
}

// events.md §5: "defaulting to the hub's announcements/banner channel" —
// prefer an actual banner channel, then anything literally named
// "announcements", falling back to wherever the composer was opened from.
export function defaultAnnouncementChannelId(channels: Channel[], fallbackChannelId: string): string {
  const candidates = announcementChannelCandidates(channels);
  const banner = candidates.find((c) => c.channel_type === "banner");
  if (banner) return banner.id;
  const named = candidates.find((c) => /announce/i.test(c.name));
  if (named) return named.id;
  return fallbackChannelId;
}
