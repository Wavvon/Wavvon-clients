import { describe, it, expect, afterEach, vi } from "vitest";
import { publicKeyHex } from "@wavvon/core";

// A hub with challenge_mode on refuses /auth/verify without a solved
// challenge's token (Wavvon-clients#134). The join has to stop before any
// auth to ask for one, and the token has to reach verify afterwards.

const SEED = "11".repeat(32);

vi.mock("../../identity/store", () => ({
  loadIdentity: async () => ({ id: "acct", seed_hex: SEED, security_nonce: 0, security_level: 0 }),
  saveIdentity: async () => {},
}));

afterEach(() => vi.unstubAllGlobals());

describe("joining a hub that runs an admission challenge", () => {
  it("stops before auth and names the key the token must be bound to", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/info")) {
        return new Response(
          JSON.stringify({ public_key: "hub-pk", name: "Hub", icon: null, challenge_mode: "click" }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { addHub, ChallengeRequiredError } = await import("../commands/hubs");

    const err = await addHub("https://hub.example", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChallengeRequiredError);
    expect((err as InstanceType<typeof ChallengeRequiredError>).pubkey).toBe(publicKeyHex(SEED));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("carries the solved challenge's token to /auth/verify", async () => {
    let verifyBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/challenge")) {
        return new Response(JSON.stringify({ challenge: "ab".repeat(32) }), { status: 200 });
      }
      verifyBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ token: "t", scope: "member" }), { status: 200 });
    }));
    const { acquireHubToken } = await import("../commands/hubAuth");

    await acquireHubToken("https://hub.example", publicKeyHex(SEED), SEED, 0, 0, undefined, undefined, undefined, "ch-tok");
    expect(verifyBody.challenge_token).toBe("ch-tok");
  });
});
