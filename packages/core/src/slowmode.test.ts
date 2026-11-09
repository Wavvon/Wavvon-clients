import { describe, expect, it } from "vitest";
import { slowmodeRetryAfter } from "./slowmode";

describe("slowmodeRetryAfter", () => {
  it("reads the wait from the hub's slowmode refusal, and nothing else", () => {
    expect(slowmodeRetryAfter('{"error":"slowmode","retry_after_secs":12}')).toBe(12);
    expect(slowmodeRetryAfter("rate_limited")).toBeNull();
    expect(slowmodeRetryAfter('{"error":"other"}')).toBeNull();
  });
});
