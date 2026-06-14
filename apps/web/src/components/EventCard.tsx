import React, { useState } from "react";
import type { HubEvent, RsvpStatus } from "../types";
import { rsvpEvent } from "@platform";

interface Props {
  event: HubEvent;
  myPubkey: string | null;
  isAdmin: boolean;
  onUpdate: (event: HubEvent) => void;
  onDelete: (eventId: string) => void;
}

const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not going",
};

export function EventCard({ event, myPubkey, isAdmin, onUpdate, onDelete }: Props) {
  const [saving, setSaving] = useState(false);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startDate = new Date(event.starts_at * 1000);
  const counts = event.rsvp_counts;

  async function handleRsvp(status: RsvpStatus) {
    setSaving(true);
    setError(null);
    try {
      await rsvpEvent(event.id, status);
      const nextCounts = { ...counts };
      if (myStatus) nextCounts[myStatus] = Math.max(0, nextCounts[myStatus] - 1);
      nextCounts[status] = nextCounts[status] + 1;
      setMyStatus(status);
      onUpdate({ ...event, rsvp_counts: nextCounts });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="event-card settings-section" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 2 }}>{event.title}</div>
          <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
            {startDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{" "}
            {startDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            {event.location && <span> · {event.location}</span>}
          </div>
        </div>
        {isAdmin && (
          <button
            className="btn-ghost"
            style={{ fontSize: "var(--text-xs)", color: "var(--danger)" }}
            onClick={() => onDelete(event.id)}
            title="Delete event"
          >
            ✕
          </button>
        )}
      </div>

      {event.description && (
        <p style={{ fontSize: "var(--text-sm)", margin: "8px 0 6px", whiteSpace: "pre-wrap" }}>
          {event.description}
        </p>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {(["going", "maybe", "not_going"] as RsvpStatus[]).map((status) => (
          <button
            key={status}
            className={myStatus === status ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: "var(--text-xs)", padding: "4px 10px" }}
            disabled={saving}
            onClick={() => handleRsvp(status)}
          >
            {RSVP_LABELS[status]}
          </button>
        ))}
      </div>

      <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
        {counts.going} going · {counts.maybe} maybe
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-xs)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
