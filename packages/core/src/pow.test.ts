import { describe, it, expect } from "vitest";
import { leadingZeroBits, verifySecurityLevel, minePowChunk, powProofString } from "./pow";

describe("leadingZeroBits", () => {
  it("counts zero bytes as 8 bits each", () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0xff]))).toBe(16);
  });

  it("counts partial leading zero bits in the first nonzero byte", () => {
    expect(leadingZeroBits(new Uint8Array([0b00010000, 0xff]))).toBe(3);
    expect(leadingZeroBits(new Uint8Array([0b10000000]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0b00000001]))).toBe(7);
  });

  it("an all-zero hash counts every bit", () => {
    expect(leadingZeroBits(new Uint8Array(4))).toBe(32);
  });
});

describe("verifySecurityLevel", () => {
  it("trivially accepts a claimed level of 0", () => {
    expect(verifySecurityLevel("deadbeef", 0n, 0)).toBe(true);
  });

  it("rejects an unearned high level", () => {
    expect(verifySecurityLevel("deadbeef", 0n, 40)).toBe(false);
  });

  it("accepts a nonce mined to a real target level", () => {
    const target = 6;
    const result = minePowChunk("deadbeef", 0n, target, 1_000_000);
    expect(result.reachedTarget).toBe(true);
    expect(verifySecurityLevel("deadbeef", result.bestNonce, result.bestLevel)).toBe(true);
  });
});

describe("minePowChunk", () => {
  it("reports the best level found even when the target isn't reached", () => {
    const result = minePowChunk("deadbeef", 0n, 64, 100);
    expect(result.reachedTarget).toBe(false);
    expect(result.bestLevel).toBeGreaterThanOrEqual(0);
    expect(result.lastNonce).toBe(100n);
  });

  it("resuming from bestLevelSoFar never reports a regression", () => {
    const first = minePowChunk("deadbeef", 0n, 64, 500);
    const second = minePowChunk("deadbeef", first.lastNonce, 64, 500, first.bestLevel);
    expect(second.bestLevel).toBeGreaterThanOrEqual(first.bestLevel);
  });
});

describe("powProofString", () => {
  it("formats as decimal nonce colon level, matching the hub's parser", () => {
    expect(powProofString(12345n, 7)).toBe("12345:7");
  });
});
