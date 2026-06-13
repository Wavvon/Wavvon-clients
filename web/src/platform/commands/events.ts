import { hubFetch } from "../http";
import type { HubEvent, RsvpStatus } from "@shared/types";

export async function getEvents(): Promise<HubEvent[]> {
  const res = await hubFetch("/events");
  return res.json() as Promise<HubEvent[]>;
}

export async function createEvent(data: {
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: number;
  end_at?: number | null;
}): Promise<HubEvent> {
  const res = await hubFetch("/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<HubEvent>;
}

export async function rsvpEvent(eventId: string, status: RsvpStatus): Promise<void> {
  await hubFetch(`/events/${eventId}/rsvp`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function cancelRsvp(eventId: string): Promise<void> {
  await hubFetch(`/events/${eventId}/rsvp`, { method: "DELETE" });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await hubFetch(`/events/${eventId}`, { method: "DELETE" });
}
