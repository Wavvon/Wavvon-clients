import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Channel } from "@wavvon/core";
import type { EventMoveAssignment, EventRsvp, HubEvent, RsvpStatus, VoiceParticipant } from "../../types";
import { EventSlotList } from "./EventSlotList";
import { EventStagingPanel } from "./EventStagingPanel";
import { reminderMinutesToOffset } from "../../utils/events";

/** Staging (organizer move-members) capability bundle — omitted entirely on
 *  platforms with no voice-move wiring (events.md §7.1 is web-only today). */
export interface EventStagingCapability {
  channels: Channel[];
  users: Array<{ public_key: string; display_name: string | null }>;
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  canMoveMembers: boolean;
  onMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;
  getEvent: (eventId: string) => Promise<HubEvent>;
  getEventAssignments: (eventId: string) => Promise<EventMoveAssignment[]>;
  getEventRsvps: (eventId: string) => Promise<EventRsvp[]>;
  createEventSquadRooms: (eventId: string, count: number, namePrefix?: string) => Promise<Channel[]>;
}

interface Props {
  event: HubEvent;
  myPubkey: string | null;
  isAdmin: boolean;
  onRsvp: (eventId: string, status: RsvpStatus, slotId?: string) => Promise<void>;
  onUpdate: (event: HubEvent) => void;
  onDelete: (eventId: string) => void;
  /** Role-slot claiming (events.md §7.5) — needs the host's rsvp command to
   *  forward a slot id, which not every platform's invoke surface supports yet. */
  slotClaimSupported?: boolean;
  staging?: EventStagingCapability;
}

const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not going",
};

export function EventCard({
  event, myPubkey, isAdmin, onRsvp, onUpdate, onDelete, slotClaimSupported, staging,
}: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showStaging, setShowStaging] = useState(false);

  // Organizer-only affordance (events.md §7.5): event creator or a hub admin,
  // AND move_members — same rule the Phase-1 right-click surface uses. The
  // client only tracks hub-wide isAdmin today, not the doc's channel-scoped
  // CREATE_EVENTS check; the hub re-verifies both on every voice_move regardless.
  const canStage = !!staging && staging.canMoveMembers && (isAdmin || event.creator_pubkey === myPubkey);

  const startDate = new Date(event.starts_at * 1000);
  const counts = event.rsvp_counts;

  async function handleRsvp(status: RsvpStatus) {
    setSaving(true);
    setError(null);
    try {
      await onRsvp(event.id, status);
      const nextCounts = { ...counts };
      if (myStatus) nextCounts[myStatus] = Math.max(0, nextCounts[myStatus] - 1);
      nextCounts[status] = nextCounts[status] + 1;
      setMyStatus(status);
      onUpdate({ ...event, rsvp_counts: nextCounts });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="event-card settings-section" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            {event.title}
            {event.hub_wide && (
              <span className="badge-chip">{t("events.card.hub_wide_badge")}</span>
            )}
          </div>
          <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
            {startDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{" "}
            {startDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            {event.location && <span> · {event.location}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {canStage && (
            <button
              className="btn-secondary"
              style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
              onClick={() => setShowStaging(true)}
            >
              {t("events.staging.button")}
            </button>
          )}
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
      </div>

      {showStaging && canStage && staging && (
        <EventStagingPanel
          eventId={event.id}
          eventTitle={event.title}
          slots={event.slots}
          channels={staging.channels}
          users={staging.users}
          voicePartByChannel={staging.voicePartByChannel}
          onMoveMember={staging.onMoveMember}
          getEvent={staging.getEvent}
          getEventAssignments={staging.getEventAssignments}
          getEventRsvps={staging.getEventRsvps}
          createEventSquadRooms={staging.createEventSquadRooms}
          onClose={() => setShowStaging(false)}
        />
      )}

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

      {event.reminder_minutes !== null && (
        <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 2 }}>
          {t("events.card.reminder", { value: t(`events.reminder.${reminderMinutesToOffset(event.reminder_minutes)}`) })}
        </div>
      )}

      {slotClaimSupported && (
        <EventSlotList
          eventId={event.id}
          slots={event.slots}
          myPubkey={myPubkey}
          onRsvp={onRsvp}
          onSlotsChange={(slots) => onUpdate({ ...event, slots })}
        />
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: "var(--text-xs)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
