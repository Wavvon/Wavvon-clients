import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HubEvent } from "../types";

interface Props {
  event: HubEvent;
  hubUrl?: string;
  isAdmin?: boolean;
  onRsvpChange?: (eventId: string, status: string) => void;
  onDeleted?: (eventId: string) => void;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EventCard({ event, hubUrl, isAdmin, onRsvpChange, onDeleted }: Props) {
  const [busy, setBusy] = useState(false);
  const [myRsvp, setMyRsvp] = useState<string | undefined>(event.my_rsvp);

  async function rsvp(status: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (hubUrl) {
        await invoke("rsvp_event_hub", { hubUrl, eventId: event.id, status });
      } else {
        await invoke("rsvp_event", { eventId: event.id, status });
      }
      setMyRsvp(status);
      onRsvpChange?.(event.id, status);
    } catch (e) {
      console.error("RSVP failed:", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!hubUrl || !isAdmin) return;
    try {
      await invoke("delete_event", { hubUrl, eventId: event.id });
      onDeleted?.(event.id);
    } catch (e) {
      console.error("Delete event failed:", e);
    }
  }

  return (
    <div className="event-card">
      <div className="event-card-header">
        <span className="event-card-icon">📅</span>
        <span className="event-card-title">{event.title}</span>
        {isAdmin && hubUrl && (
          <button
            className="btn-small btn-secondary-small"
            style={{ marginLeft: "auto" }}
            onClick={handleDelete}
            title="Delete event"
          >
            ✕
          </button>
        )}
      </div>
      <div className="event-card-time">{formatTimestamp(event.starts_at)}</div>
      {event.ends_at && (
        <div className="event-card-time event-card-time-end">
          until {formatTimestamp(event.ends_at)}
        </div>
      )}
      {event.location && (
        <div className="event-card-location">📍 {event.location}</div>
      )}
      {event.description && (
        <div className="event-card-description">{event.description}</div>
      )}
      <div className="event-card-rsvp-counts">
        <span>{event.going_count} going</span>
        <span> · </span>
        <span>{event.maybe_count} maybe</span>
      </div>
      <div className="event-card-actions">
        <button
          className={`event-card-btn event-card-btn-going${myRsvp === "going" ? " active" : ""}`}
          disabled={busy}
          onClick={() => rsvp("going")}
        >
          Going
        </button>
        <button
          className={`event-card-btn event-card-btn-maybe${myRsvp === "maybe" ? " active" : ""}`}
          disabled={busy}
          onClick={() => rsvp("maybe")}
        >
          Maybe
        </button>
        <button
          className={`event-card-btn event-card-btn-cantgo${myRsvp === "not_going" ? " active" : ""}`}
          disabled={busy}
          onClick={() => rsvp("not_going")}
        >
          Can't go
        </button>
      </div>
    </div>
  );
}
