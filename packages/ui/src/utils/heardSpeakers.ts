const NOBODY: ReadonlySet<string> = new Set();

/** Who lights up as speaking: nobody while you are deafened, and never
 *  someone you blocked or ignored, since you hear neither. */
export function heardSpeakers(speaking: Set<string>, deafened: boolean, silenced: ReadonlySet<string>): Set<string> {
  if (deafened) return NOBODY as Set<string>;
  if (![...speaking].some((pk) => silenced.has(pk))) return speaking;
  return new Set([...speaking].filter((pk) => !silenced.has(pk)));
}
