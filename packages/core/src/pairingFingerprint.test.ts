import { describe, expect, it } from "vitest";
import { deviceFingerprint } from "./pairingFingerprint";

describe("deviceFingerprint", () => {
  it("is the first 8 bytes, colon-separated, as the desktop shell prints them", () => {
    expect(deviceFingerprint("A1B2C3D4E5F60718" + "ff".repeat(24))).toBe("a1:b2:c3:d4:e5:f6:07:18");
  });
});
