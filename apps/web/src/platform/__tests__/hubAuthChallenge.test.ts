import { describe, it, expect, afterEach, vi } from "vitest";
import { acquireHubToken } from "../commands/hubAuth";

// The identity key signs envelopes, messages and certs as well. Signing
// whatever a hub sends as a "challenge" would let a hostile hub collect a
// signature it can replay as one of those (Wavvon-server#111).
describe("acquireHubToken", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses to sign a challenge that is not 32 bytes", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/challenge")) {
        return new Response(JSON.stringify({ challenge: "aa".repeat(36) }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      acquireHubToken("https://hub.example", "ab".repeat(32), "cd".repeat(32), 0, 0),
    ).rejects.toThrow(/32|36-byte/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
