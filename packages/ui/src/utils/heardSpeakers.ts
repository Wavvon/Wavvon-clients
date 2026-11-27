type Keys = ReadonlySet<string>;
type Speaking = Set<string>;

const NOBODY: Keys = new Set();

/** Who lights up as speaking: nobody while you are deafened, and never
 *  someone you blocked or ignored, since you hear neither. */
export function heardSpeakers(speaking: Speaking, deafened: boolean, silenced: Keys): Speaking {
  if (deafened) return NOBODY as Speaking;
  if (![...speaking].some((pk) => silenced.has(pk))) return speaking;
  return new Set([...speaking].filter((pk) => !silenced.has(pk)));
}
