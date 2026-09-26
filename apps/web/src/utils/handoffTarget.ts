/** A hub build sends people to the user build as `?hub=&code=` (constants.ts
 *  USER_CLIENT_URL). Rather than carry a second shape through the add-hub
 *  flow, both sources of a pending join collapse to an invite URL — because
 *  `parseHubInput` already knows how to take the code back out of one.
 *
 *  That round trip is the contract: whatever this builds, parseHubInput must
 *  decompose into the same hub and code. handoffTarget.test.ts asserts it
 *  against the real parser, so a change to either side fails there rather
 *  than silently dropping an invite code on a join. */
export function handoffTargetUrl(hub: string, code: string): string {
  const base = hub.trim().replace(/\/+$/, "");
  return code ? `${base}/join/${code}` : base;
}
