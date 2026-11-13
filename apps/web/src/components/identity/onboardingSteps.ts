export type SetupStep = "choose" | "generated" | "recover" | "pair" | "profile" | "label";

/** Step numbers for the counter, counting only the screens this path shows.
 *  Joining happens after the frame closes, so it is not a step here. Creating
 *  an identity from an invite skips the phrase screen (it is asked for after
 *  the first message), so that path is two steps; until the user picks a
 *  path, an invite assumes the create path, which is the one it leads with. */
export function onboardingSteps(invited: boolean, step: SetupStep, skippedPhrase: boolean) {
  const short = invited && (step === "choose" || skippedPhrase);
  const total = short ? 2 : 3;
  const stepOf: Record<SetupStep, number> = {
    choose: 1, generated: 2, recover: 2, pair: 2, label: 2, profile: total,
  };
  return { total, stepOf };
}
