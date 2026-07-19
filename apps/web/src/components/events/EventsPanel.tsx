import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Channel, HubEvent, User, VoiceParticipant } from "@shared/types";
import { getEvents, deleteEvent } from "@platform";
import { EventCalendar } from "./EventCalendar";
import { EventCard } from "./EventCard";
import { EventComposer } from "./EventComposer";

type EventsView = "list" | "month";

interface Props {
  channelId: string;
  myPubkey: string | null;
  isAdmin: boolean;
  channels: Channel[];
  users: User[];
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  canMoveMembers: boolean;
  onMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;
}

export function EventsPanel({
  channelId, myPubkey, isAdmin, channels, users, voicePartByChannel, canMoveMembers, onMoveMember,
}: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [view, setView] = useState<EventsView>("list");
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await getEvents({ upcoming: true, limit: 100 });
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

  // Month view is bounded by the already-fetched upcoming window
  // (events.md §9) — no selection shows every event in the viewed month,
  // a selection narrows to that single day.
  const visibleEvents = useMemo(() => {
    if (view !== "month") return events;
    const inViewedMonth = events.filter((e) => {
      const d = new Date(e.starts_at * 1000);
      return d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth();
    });
    if (!selectedDay) return inViewedMonth;
    return inViewedMonth.filter((e) => {
      const d = new Date(e.starts_at * 1000);
      return (
        d.getFullYear() === selectedDay.getFullYear() &&
        d.getMonth() === selectedDay.getMonth() &&
        d.getDate() === selectedDay.getDate()
      );
    });
  }, [events, view, viewMonth, selectedDay]);

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

      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <button
          className={view === "list" ? "btn-primary" : "btn-secondary"}
          style={{ fontSize: "var(--text-xs)", padding: "2px 10px" }}
          onClick={() => setView("list")}
        >
          {t("events.view.list")}
        </button>
        <button
          className={view === "month" ? "btn-primary" : "btn-secondary"}
          style={{ fontSize: "var(--text-xs)", padding: "2px 10px" }}
          onClick={() => setView("month")}
        >
          {t("events.view.month")}
        </button>
      </div>

      {view === "month" && (
        <EventCalendar
          events={events}
          month={viewMonth}
          onMonthChange={setViewMonth}
          onSelectDay={setSelectedDay}
          selectedDay={selectedDay}
        />
      )}

      {loading && <p className="muted">Loading…</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!loading && !error && visibleEvents.length === 0 && (
        <p className="muted">{view === "month" ? t("events.calendar.no_events") : "No upcoming events."}</p>
      )}

      {visibleEvents.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          myPubkey={myPubkey}
          isAdmin={isAdmin}
          channels={channels}
          users={users}
          voicePartByChannel={voicePartByChannel}
          canMoveMembers={canMoveMembers}
          onMoveMember={onMoveMember}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ))}

      {showComposer && (
        <EventComposer
          channelId={channelId}
          channels={channels}
          canHubWide={isAdmin}
          onCreated={handleCreated}
          onClose={() => setShowComposer(false)}
        />
      )}
    </div>
  );
}
