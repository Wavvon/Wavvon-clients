import { describe, it, expect } from "vitest";
import { dhPinVerdict } from "./identity/crypto";

describe("dhPinVerdict", () => {
  it("pins the first key, accepts it again, and calls a different one a change", () => {
    expect(dhPinVerdict(undefined, "k1")).toBe("new");
    expect(dhPinVerdict("k1", "k1")).toBe("same");
    expect(dhPinVerdict("k1", "k2")).toBe("changed");
  });
});
