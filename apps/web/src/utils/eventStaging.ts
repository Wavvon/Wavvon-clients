// Pure logic for the event staging panel (events.md §7.5) — kept separate
// from EventStagingPanel.tsx so the grouping/status derivation is
// unit-testable without a live socket, fetch, or a DOM. Mirrors the
// voiceMove.ts precedent.

import type { ClaimantVoiceStatus, StagingGroup, VoiceMoveChannelOption } from "@wavvon/ui";
import type { EventMoveAssignment, EventRsvp, EventSlot, VoiceParticipant } from "../types";

export const SQUAD_ROOM_COUNT_MIN = 1;
export const SQUAD_ROOM_COUNT_MAX = 20;

/** Pubkeys with a plain "going" RSVP that never claimed a slot — the
 *  synthesized "Unassigned" bucket (events.md §7.5). */
export function unassignedGoingPubkeys(rsvps: EventRsvp[], slots: EventSlot[]): string[] {
  const claimed = new Set(slots.flatMap((s) => s.claimants));
  return rsvps.filter((r) => r.status === "going" && !claimed.has(r.pubkey)).map((r) => r.pubkey);
}

/** A claimant's current voice standing: in voice now beats a queued
 *  assignment (a live location is more useful to an organizer than a
 *  pending one), which beats plain "not yet acted on". */
export function claimantVoiceStatus(
  pubkey: string,
  assignments: EventMoveAssignment[],
  voicePartByChannel: Record<string, VoiceParticipant[]>,
  channelNameById: Map<string, string>,
): ClaimantVoiceStatus {
  for (const [channelId, participants] of Object.entries(voicePartByChannel)) {
    if (participants.some((p) => p.public_key === pubkey)) {
      return { kind: "in_voice", channelName: channelNameById.get(channelId) ?? "?" };
    }
  }
  const assignment = assignments.find((a) => a.user_pubkey === pubkey);
  if (assignment) {
    return { kind: "assigned", channelName: channelNameById.get(assignment.target_channel_id) ?? "?" };
  }
  return { kind: "none" };
}

/** Builds the panel's ordered groups: event slots by position, then the
 *  "Unassigned" bucket (`id: null`) last if any plain-going RSVPs exist.
 *  `name` is unused for the unassigned bucket — the component supplies its
 *  own localized label for `id === null`. */
export function buildStagingGroups(slots: EventSlot[], unassigned: string[]): StagingGroup[] {
  const groups: StagingGroup[] = slots
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, claimed: s.claimed, claimants: s.claimants }));
  if (unassigned.length > 0) {
    groups.push({ id: null, name: "", capacity: null, claimed: null, claimants: unassigned });
  }
  return groups;
}

/** Bounds the squad-room spawn stepper to the hub's own `1..=20` limit
 *  (events.md §7.5 Phase 3) so an out-of-range value never reaches the
 *  request — the input's min/max attributes only advise the browser, they
 *  don't stop a typed value from escaping them. */
export function clampSquadRoomCount(count: number): number {
  if (!Number.isFinite(count)) return SQUAD_ROOM_COUNT_MIN;
  return Math.min(SQUAD_ROOM_COUNT_MAX, Math.max(SQUAD_ROOM_COUNT_MIN, Math.round(count)));
}

/** Puts a destination channel list's entries belonging to this event first
 *  (its own auto-spawned squad rooms), preserving each group's relative
 *  order otherwise — events.md §7.5 Phase 3's "list them first" for rooms
 *  whose `channel.event_id` matches the event being staged. */
export function orderDestinationsForEvent(
  destinations: VoiceMoveChannelOption[],
  eventChannelIds: Set<string>,
): VoiceMoveChannelOption[] {
  const owned: VoiceMoveChannelOption[] = [];
  const rest: VoiceMoveChannelOption[] = [];
  for (const d of destinations) {
    (eventChannelIds.has(d.id) ? owned : rest).push(d);
  }
  return [...owned, ...rest];
}
