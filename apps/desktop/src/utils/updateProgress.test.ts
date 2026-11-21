import { describe, expect, it } from "vitest";
import { etaSeconds, smoothRate, toMb } from "./updateProgress";

describe("update progress", () => {
  it("starts the average at the first sample, then moves toward new ones", () => {
    expect(smoothRate(null, 1000)).toBe(1000);
    expect(smoothRate(1000, 2000)).toBe(1300);
  });

  it("estimates the time left from the smoothed rate", () => {
    expect(etaSeconds(0, 10_000, 1000)).toBe(10);
    expect(etaSeconds(9_500, 10_000, 1000)).toBe(1);
  });

  it("gives no estimate without a total, without a rate, or when done", () => {
    expect(etaSeconds(100, null, 1000)).toBeNull();
    expect(etaSeconds(100, 1000, null)).toBeNull();
    expect(etaSeconds(100, 1000, 0)).toBeNull();
    expect(etaSeconds(1000, 1000, 50)).toBeNull();
  });

  it("formats megabytes with one decimal", () => {
    expect(toMb(1024 * 1024 * 12.34)).toBe("12.3");
  });
});
