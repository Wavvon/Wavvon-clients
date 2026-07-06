import type { EventSlot } from "../types";

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
