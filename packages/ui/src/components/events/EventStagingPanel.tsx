import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Channel } from "@wavvon/core";
import { StagingPanel } from "../StagingPanel";
import type { EventMoveAssignment, EventRsvp, EventSlot, HubEvent, VoiceParticipant } from "../../types";
import {
  buildStagingGroups,
  claimantVoiceStatus,
  clampSquadRoomCount,
  moveChannelOptions,
  orderDestinationsForEvent,
  unassignedGoingPubkeys,
} from "../../utils/eventStaging";

interface Props {
  eventId: string;
  eventTitle: string;
  slots: EventSlot[];
  channels: Channel[];
  users: Array<{ public_key: string; display_name: string | null }>;
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  onMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;
  getEvent: (eventId: string) => Promise<HubEvent>;
  getEventAssignments: (eventId: string) => Promise<EventMoveAssignment[]>;
  getEventRsvps: (eventId: string) => Promise<EventRsvp[]>;
  createEventSquadRooms: (eventId: string, count: number, namePrefix?: string) => Promise<Channel[]>;
  onClose: () => void;
}

// A voice_move send has no request/response round-trip (it's a fire-and-forget
// WS message), so there's nothing to await before refetching. This delay just
// gives the hub a moment to persist the assignment row before the panel reads
// it back — best-effort for v1, per the doc's "loops per claimant" posture.
const REFETCH_DELAY_MS = 400;

export function EventStagingPanel({
  eventId, eventTitle, slots, channels, users, voicePartByChannel, onMoveMember,
  getEvent, getEventAssignments, getEventRsvps, createEventSquadRooms, onClose,
}: Props) {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<EventMoveAssignment[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  // The `slots` prop is a point-in-time snapshot from whichever client last
  // loaded the events list — it never updates when a DIFFERENT client claims
  // a slot. Seed from the prop so the panel isn't empty before the first
  // fetch resolves, then replace with the server's current slots on load.
  const [liveSlots, setLiveSlots] = useState<EventSlot[]>(slots);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [squadRoomCount, setSquadRoomCount] = useState(4);
  const [squadRoomPrefix, setSquadRoomPrefix] = useState(() => t("events.staging.squad_rooms.default_prefix"));
  const [spawningSquadRooms, setSpawningSquadRooms] = useState(false);
  const [squadRoomError, setSquadRoomError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [freshEvent, nextAssignments, nextRsvps] = await Promise.all([
        getEvent(eventId),
        getEventAssignments(eventId),
        getEventRsvps(eventId),
      ]);
      setLiveSlots(freshEvent.slots);
      setAssignments(nextAssignments);
      setRsvps(nextRsvps);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId, getEvent, getEventAssignments, getEventRsvps]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const channelNameById = useMemo(() => new Map(channels.map((c) => [c.id, c.name])), [channels]);
  const eventChannelIds = useMemo(
    () => new Set(channels.filter((c) => c.event_id === eventId).map((c) => c.id)),
    [channels, eventId],
  );
  const destinationChannels = useMemo(
    () => orderDestinationsForEvent(moveChannelOptions(channels), eventChannelIds),
    [channels, eventChannelIds],
  );

  const nameFor = useCallback(
    (pubkey: string) => users.find((u) => u.public_key === pubkey)?.display_name || pubkey.slice(0, 8),
    [users],
  );

  const statusFor = useCallback(
    (pubkey: string) => claimantVoiceStatus(pubkey, assignments, voicePartByChannel, channelNameById),
    [assignments, voicePartByChannel, channelNameById],
  );

  const groups = useMemo(
    () => buildStagingGroups(liveSlots, unassignedGoingPubkeys(rsvps, liveSlots)),
    [liveSlots, rsvps],
  );

  function refetchSoon() {
    setTimeout(() => void load(), REFETCH_DELAY_MS);
  }

  function handleAssign(pubkey: string, channelId: string) {
    onMoveMember(pubkey, channelId, eventId);
    refetchSoon();
  }

  function handleBulkAssign(pubkeys: string[], channelId: string) {
    for (const pubkey of pubkeys) onMoveMember(pubkey, channelId, eventId);
    refetchSoon();
  }

  function handleSquadRoomCountChange(count: number) {
    setSquadRoomCount(clampSquadRoomCount(count));
  }

  async function handleSpawnSquadRooms() {
    setSpawningSquadRooms(true);
    setSquadRoomError(null);
    try {
      const prefix = squadRoomPrefix.trim();
      await createEventSquadRooms(eventId, squadRoomCount, prefix || undefined);
      // The created channels arrive via the normal channels-updated WS push
      // (state.channels flows back down as this panel's `channels` prop), so
      // there's nothing to merge locally here.
    } catch (e) {
      setSquadRoomError(e instanceof Error ? e.message : String(e));
    } finally {
      setSpawningSquadRooms(false);
    }
  }

  return (
    <StagingPanel
      eventTitle={eventTitle}
      groups={groups}
      destinationChannels={destinationChannels}
      nameFor={nameFor}
      statusFor={statusFor}
      onAssign={handleAssign}
      onBulkAssign={handleBulkAssign}
      loading={loading}
      error={error}
      onClose={onClose}
      squadRoomCount={squadRoomCount}
      onSquadRoomCountChange={handleSquadRoomCountChange}
      squadRoomPrefix={squadRoomPrefix}
      onSquadRoomPrefixChange={setSquadRoomPrefix}
      onSpawnSquadRooms={() => void handleSpawnSquadRooms()}
      spawningSquadRooms={spawningSquadRooms}
      squadRoomError={squadRoomError}
    />
  );
}
