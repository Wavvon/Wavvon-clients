import type { VoiceParticipant } from "../types";

/** Friends first, then everyone else, each part keeping arrival order: in a
 *  crowded room the people you know are the ones you look for. */
export function friendsFirst(people: VoiceParticipant[], friends?: Set<string>): VoiceParticipant[] {
  if (!friends || friends.size === 0) return people;
  return [...people.filter((p) => friends.has(p.public_key)), ...people.filter((p) => !friends.has(p.public_key))];
}
