import { describe, expect, it } from "vitest";
import { fromThreshold, ruleUnits, toThreshold } from "../badgeUnits";

describe("badgeUnits", () => {
  it("converts durations to seconds and back", () => {
    expect(toThreshold(2, "months")).toBe(5184000);
    expect(fromThreshold(5184000, "member_age")).toEqual({ amount: 2, unit: "months" });
    expect(fromThreshold(86400 * 7, "member_age")).toEqual({ amount: 7, unit: "days" });
    expect(toThreshold(10, "hours")).toBe(36000);
  });
  it("keeps counts as counts", () => {
    expect(toThreshold(100, "count")).toBe(100);
    expect(ruleUnits("messages")).toEqual(["count"]);
  });
});
