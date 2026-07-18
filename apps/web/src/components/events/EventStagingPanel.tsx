import { useCallback, useEffect, useMemo, useState } from "react";
import { StagingPanel } from "@wavvon/ui";
import type { Channel, EventMoveAssignment, EventRsvp, EventSlot, User, VoiceParticipant } from "@shared/types";
import { getEventAssignments, getEventRsvps } from "@platform";
import { moveChannelOptions } from "@shared/utils/voiceMove";
import { buildStagingGroups, claimantVoiceStatus, unassignedGoingPubkeys } from "@shared/utils/eventStaging";

interface Props {
  eventId: string;
  eventTitle: string;
  slots: EventSlot[];
  channels: Channel[];
  users: User[];
  voicePartByChannel: Record<string, VoiceParticipant[]>;
  onMoveMember: (targetPubkey: string, targetChannelId: string, eventId?: string) => void;
  onClose: () => void;
}

// A voice_move send has no request/response round-trip (it's a fire-and-forget
// WS message), so there's nothing to await before refetching. This delay just
// gives the hub a moment to persist the assignment row before the panel reads
// it back — best-effort for v1, per the doc's "loops per claimant" posture.
const REFETCH_DELAY_MS = 400;

export function EventStagingPanel({ eventId, eventTitle, slots, channels, users, voicePartByChannel, onMoveMember, onClose }: Props) {
  const [assignments, setAssignments] = useState<EventMoveAssignment[]>([]);
  const [rsvps, setRsvps] = useState<EventRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextAssignments, nextRsvps] = await Promise.all([
        getEventAssignments(eventId),
        getEventRsvps(eventId),
      ]);
      setAssignments(nextAssignments);
      setRsvps(nextRsvps);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const channelNameById = useMemo(() => new Map(channels.map((c) => [c.id, c.name])), [channels]);
  const destinationChannels = useMemo(() => moveChannelOptions(channels), [channels]);

  const nameFor = useCallback(
    (pubkey: string) => users.find((u) => u.public_key === pubkey)?.display_name || pubkey.slice(0, 8),
    [users],
  );

  const statusFor = useCallback(
    (pubkey: string) => claimantVoiceStatus(pubkey, assignments, voicePartByChannel, channelNameById),
    [assignments, voicePartByChannel, channelNameById],
  );

  const groups = useMemo(
    () => buildStagingGroups(slots, unassignedGoingPubkeys(rsvps, slots)),
    [slots, rsvps],
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
    />
  );
}
