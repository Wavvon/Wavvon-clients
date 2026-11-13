import { describe, it, expect } from "vitest";
import { onboardingSteps } from "../onboardingSteps";

describe("onboardingSteps", () => {
  it("counts an invited create as two steps, with no gap", () => {
    expect(onboardingSteps(true, "choose", false)).toMatchObject({ total: 2 });
    const { total, stepOf } = onboardingSteps(true, "profile", true);
    expect([stepOf.choose, stepOf.profile, total]).toEqual([1, 2, 2]);
  });

  it("counts an invited recovery as three steps", () => {
    const { total, stepOf } = onboardingSteps(true, "recover", false);
    expect([stepOf.recover, stepOf.profile, total]).toEqual([2, 3, 3]);
  });

  it("counts a create without an invite as three steps, phrase included", () => {
    const { total, stepOf } = onboardingSteps(false, "generated", false);
    expect([stepOf.generated, stepOf.profile, total]).toEqual([2, 3, 3]);
  });
});
