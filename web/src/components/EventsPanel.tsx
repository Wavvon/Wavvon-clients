import React, { useEffect, useState } from "react";
import type { HubEvent } from "../types";
import { getEvents, deleteEvent } from "@platform";
import { EventCard } from "./EventCard";
import { EventComposer } from "./EventComposer";

interface Props {
  myPubkey: string | null;
  isAdmin: boolean;
}

export function EventsPanel({ myPubkey, isAdmin }: Props) {
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    getEvents()
      .then((list) => {
        const now = Math.floor(Date.now() / 1000);
        const upcoming = list
          .filter((e) => e.start_at >= now || (e.end_at !== null && e.end_at >= now))
          .sort((a, b) => a.start_at - b.start_at);
        setEvents(upcoming);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

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

  function handleCreated(event: HubEvent) {
    setEvents((prev) => [...prev, event].sort((a, b) => a.start_at - b.start_at));
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
          onCreated={handleCreated}
          onClose={() => setShowComposer(false)}
        />
      )}
    </div>
  );
}
