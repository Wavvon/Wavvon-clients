import type { User, VoiceParticipant } from "@shared/types";

// Invisible presence hides a user behind an `online: false` User record (see
// App.tsx's onSetStatus) — everywhere a plain member roster reads `online`
// already treats them as offline. Voice participant lists are populated from
// a separate voice_participant_* event stream that doesn't carry presence at
// all, so without this filter an invisible user's own voice membership would
// out them. Self is always kept — hiding your own row from your own client
// is confusing, not private.
export function visibleParticipants(
  participants: VoiceParticipant[],
  users: User[],
  selfPubkey: string | null,
): VoiceParticipant[] {
  const hiddenKeys = new Set(users.filter((u) => !u.online).map((u) => u.public_key));
  return participants.filter((p) => p.public_key === selfPubkey || !hiddenKeys.has(p.public_key));
}
