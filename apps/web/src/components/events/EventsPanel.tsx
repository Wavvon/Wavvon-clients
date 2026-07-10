import React, { useCallback, useEffect, useState } from "react";
import type { HubEvent } from "@shared/types";
import { getEvents, deleteEvent } from "@platform";
import { EventCard } from "./EventCard";
import { EventComposer } from "./EventComposer";

interface Props {
  channelId: string;
  myPubkey: string | null;
  isAdmin: boolean;
}

export function EventsPanel({ channelId, myPubkey, isAdmin }: Props) {
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await getEvents();
      const now = Math.floor(Date.now() / 1000);
      setEvents(
        list
          .filter((e) => e.starts_at >= now || (e.ends_at !== null && e.ends_at >= now))
          .sort((a, b) => a.starts_at - b.starts_at),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleDelete(eventId: string) {
    try {
      await deleteEvent(eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (e) {
      setError(String(e));
    }
  }

  function handleUpdate(updated: HubEvent) {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleCreated() {
    // The create response is a bare event (no rsvp_counts/slots and no
    // slot IDs), so refetch to get the full EventWithRsvps the card needs.
    void reload();
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 600 }}>Upcoming events</h3>
        {isAdmin && (
          <button className="btn-secondary" onClick={() => setShowComposer(true)}>
            + Create event
          </button>
        )}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="muted">No upcoming events.</p>
      )}

      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          myPubkey={myPubkey}
          isAdmin={isAdmin}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ))}

      {showComposer && (
        <EventComposer
          channelId={channelId}
          onCreated={handleCreated}
          onClose={() => setShowComposer(false)}
        />
      )}
    </div>
  );
}
