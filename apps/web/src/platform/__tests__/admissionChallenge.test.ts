import { describe, it, expect, afterEach, vi } from "vitest";
import { publicKeyHex } from "@wavvon/core";

// A hub with challenge_mode on refuses /auth/verify without a solved
// challenge's token (Wavvon-clients#134) — but only for a key it is admitting:
// a member and a named invite are waived (#142). So the client asks by trying,
// and offers the challenge only on that refusal.

const SEED = "11".repeat(32);

vi.mock("../../identity/store", () => ({
  loadIdentity: async () => ({ id: "acct", seed_hex: SEED, security_nonce: 0, security_level: 0 }),
  saveIdentity: async () => {},
}));

afterEach(() => vi.unstubAllGlobals());

function hubAnsweringVerify(verify: () => Response) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/info")) {
      return new Response(
        JSON.stringify({ public_key: "hub-pk", name: "Hub", icon: null, challenge_mode: "click" }),
        { status: 200 },
      );
    }
    if (url.endsWith("/auth/challenge")) {
      return new Response(JSON.stringify({ challenge: "ab".repeat(32) }), { status: 200 });
    }
    if (url.endsWith("/auth/verify")) return verify();
    throw new Error(`stop: ${url}`);
  });
}

// The first dynamic import of hubs.ts transforms its whole graph, which can
// outlast vitest's 5s default on a cold run.
describe("joining a hub that runs an admission challenge", { timeout: 30_000 }, () => {
  it("asks for the challenge when the hub refuses for want of one, naming the key to bind", async () => {
    vi.stubGlobal("fetch", hubAnsweringVerify(() => new Response("Challenge token required", { status: 403 })));
    const { addHub, ChallengeRequiredError } = await import("../commands/hubs");

    const err = await addHub("https://hub.example", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChallengeRequiredError);
    expect((err as InstanceType<typeof ChallengeRequiredError>).pubkey).toBe(publicKeyHex(SEED));
  });

  it("does not ask when the hub waives it", async () => {
    vi.stubGlobal("fetch", hubAnsweringVerify(() => new Response(JSON.stringify({ token: "t", scope: "member" }), { status: 200 })));
    const { addHub, ChallengeRequiredError } = await import("../commands/hubs");

    // Past auth the join goes on to things this test does not stand up; all
    // that matters is that it got there without a challenge.
    const err = await addHub("https://hub.example", {}).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ChallengeRequiredError);
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
