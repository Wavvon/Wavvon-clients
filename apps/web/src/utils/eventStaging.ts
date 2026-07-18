// Pure logic for the event staging panel (events.md §7.5) — kept separate
// from EventStagingPanel.tsx so the grouping/status derivation is
// unit-testable without a live socket, fetch, or a DOM. Mirrors the
// voiceMove.ts precedent.

import type { ClaimantVoiceStatus, StagingGroup } from "@wavvon/ui";
import type { EventMoveAssignment, EventRsvp, EventSlot, VoiceParticipant } from "../types";

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
