import { hubFetch } from "../http";
import type { EventMoveAssignment, EventRsvp, EventSlot, HubEvent, RsvpStatus } from "@shared/types";

export async function getEvents(): Promise<HubEvent[]> {
  const res = await hubFetch("/events");
  return res.json() as Promise<HubEvent[]>;
}

export interface CreateEventSlotInput {
  name: string;
  capacity?: number | null;
}

export async function createEvent(data: {
  channel_id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: number;
  ends_at?: number | null;
  reminder_minutes?: number | null;
  slots?: CreateEventSlotInput[];
}): Promise<HubEvent> {
  const res = await hubFetch("/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<HubEvent>;
}

// `slotId` omitted clears any existing slot claim while keeping `status`
// (used both for plain status changes and to explicitly unclaim a slot).
export async function rsvpEvent(eventId: string, status: RsvpStatus, slotId?: string): Promise<void> {
  const body: { status: RsvpStatus; slot_id?: string } = { status };
  if (slotId !== undefined) body.slot_id = slotId;
  await hubFetch(`/events/${eventId}/rsvp`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cancelRsvp(eventId: string): Promise<void> {
  await hubFetch(`/events/${eventId}/rsvp`, {
    method: "POST",
    body: JSON.stringify({ status: "not_going" }),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await hubFetch(`/events/${eventId}`, { method: "DELETE" });
}

export async function createEventSlot(
  eventId: string,
  data: { name: string; capacity?: number | null },
): Promise<EventSlot> {
  const res = await hubFetch(`/events/${eventId}/slots`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<EventSlot>;
}

export async function updateEventSlot(
  eventId: string,
  slotId: string,
  data: { name?: string; capacity?: number | null },
): Promise<EventSlot> {
  const res = await hubFetch(`/events/${eventId}/slots/${slotId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<EventSlot>;
}

export async function deleteEventSlot(eventId: string, slotId: string): Promise<void> {
  await hubFetch(`/events/${eventId}/slots/${slotId}`, { method: "DELETE" });
}

// Full RSVP list (pubkey + status), used by the staging panel to find plain
// "going" RSVPs that never claimed a slot (events.md §7.5 "Unassigned" group).
export async function getEventRsvps(eventId: string): Promise<EventRsvp[]> {
  const res = await hubFetch(`/events/${eventId}/rsvps`);
  return res.json() as Promise<EventRsvp[]>;
}

// Queued voice-move assignments for an event (events.md §7.3/§7.5) —
// organizers only, 403/404 for everyone else.
export async function getEventAssignments(eventId: string): Promise<EventMoveAssignment[]> {
  const res = await hubFetch(`/events/${eventId}/assignments`);
  return res.json() as Promise<EventMoveAssignment[]>;
}
