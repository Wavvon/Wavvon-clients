export type SetupStep = "choose" | "generated" | "recover" | "pair" | "profile" | "label" | "interests" | "hubs";

/** Step numbers for the counter, counting only the screens this path shows.
 *  Joining happens after the frame closes, so it is not a step here. Creating
 *  an identity from an invite skips the phrase screen (it is asked for after
 *  the first message), so that path is two steps; until the user picks a
 *  path, an invite assumes the create path, which is the one it leads with.
 *  With a directory and no invite, interests and suggestions follow the
 *  profile. */
export function onboardingSteps(invited: boolean, step: SetupStep, skippedPhrase: boolean, withDirectory = false) {
  const short = invited && (step === "choose" || skippedPhrase);
  const profile = short ? 2 : 3;
  const total = withDirectory ? profile + 2 : profile;
  const stepOf: Record<SetupStep, number> = {
    choose: 1, generated: 2, recover: 2, pair: 2, label: 2, profile, interests: profile + 1, hubs: profile + 2,
  };
  return { total, stepOf };
}
