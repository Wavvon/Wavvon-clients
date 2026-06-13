import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HubEvent } from "../types";
import { EventCard } from "./EventCard";
import { EventComposer } from "./EventComposer";

interface Props {
  hubUrl: string;
  isAdmin: boolean;
  onClose: () => void;
}

export function EventsPanel({ hubUrl, isAdmin, onClose }: Props) {
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    invoke<HubEvent[]>("get_hub_events", { hubUrl })
      .then(setEvents)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [hubUrl]);

  function handleRsvpChange(eventId: string, _status: string) {
    invoke<HubEvent[]>("get_hub_events", { hubUrl })
      .then(setEvents)
      .catch(() => {});
  }

  function handleDeleted(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  function handleCreated(event: HubEvent) {
    setEvents((prev) => [...prev, event].sort((a, b) => a.starts_at - b.starts_at));
    setComposing(false);
  }

  return (
    <>
      <div className="events-panel-overlay" onClick={onClose}>
        <div
          className="events-panel"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Upcoming events"
        >
          <div className="events-panel-header">
            <span className="events-panel-title">Upcoming Events</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {isAdmin && (
                <button
                  className="btn-small"
                  onClick={(e) => { e.stopPropagation(); setComposing(true); }}
                >
                  + Create
                </button>
              )}
              <button
                className="events-panel-close"
                onClick={onClose}
                aria-label="Close events panel"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="events-panel-body">
            {loading && <div className="events-panel-empty">Loading…</div>}
            {error && <div className="events-panel-empty events-panel-error">{error}</div>}
            {!loading && !error && events.length === 0 && (
              <div className="events-panel-empty">No upcoming events.</div>
            )}
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                hubUrl={hubUrl}
                isAdmin={isAdmin}
                onRsvpChange={handleRsvpChange}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        </div>
      </div>
      {composing && (
        <EventComposer
          hubUrl={hubUrl}
          onCreated={handleCreated}
          onClose={() => setComposing(false)}
        />
      )}
    </>
  );
}
