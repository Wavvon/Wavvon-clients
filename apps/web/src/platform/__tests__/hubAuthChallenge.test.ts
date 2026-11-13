import { describe, it, expect, afterEach, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  AUTH_CHALLENGE_SCHEME,
  BOUND_AUTH_CHALLENGE_SCHEME,
  authChallengeSigningBytes,
  boundAuthChallengeSigningBytes,
  hexToBytes,
  publicKeyHex,
} from "@wavvon/core";
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

describe("acquireHubToken with a server that names the tagged scheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("signs the domain-tagged bytes, not the raw challenge", async () => {
    const seed = "cd".repeat(32);
    const challenge = "ab".repeat(32);
    let verifyBody: Record<string, string> = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/challenge")) {
        return new Response(JSON.stringify({ challenge, scheme: AUTH_CHALLENGE_SCHEME }), { status: 200 });
      }
      verifyBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ token: "t", scope: "member" }), { status: 200 });
    }));
    await acquireHubToken("https://hub.example", publicKeyHex(seed), seed, 0, 0);
    const tagged = authChallengeSigningBytes(hexToBytes(challenge));
    expect(ed25519.verify(hexToBytes(verifyBody.signature), tagged, hexToBytes(publicKeyHex(seed)))).toBe(true);
  });
});

describe("acquireHubToken with a server that names no scheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses rather than signing the raw challenge", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/challenge")) {
        return new Response(JSON.stringify({ challenge: "ab".repeat(32) }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      acquireHubToken("https://hub.example", "ab".repeat(32), "cd".repeat(32), 0, 0),
    ).rejects.toThrow(/scheme/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("acquireHubToken with a server that names the bound scheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The answer names the server at the address we are talking to, from its own
  // /info: relayed to another server it names the wrong one (Wavvon-server#294).
  it("binds the answer to the key that server's /info presents", async () => {
    const seed = "cd".repeat(32);
    const challenge = "ab".repeat(32);
    const hubKey = "ef".repeat(32);
    let verifyBody: Record<string, string> = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/challenge")) {
        return new Response(JSON.stringify({ challenge, scheme: BOUND_AUTH_CHALLENGE_SCHEME }), { status: 200 });
      }
      if (url === "https://hub.example/info") {
        return new Response(JSON.stringify({ public_key: hubKey }), { status: 200 });
      }
      verifyBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ token: "t", scope: "member" }), { status: 200 });
    }));
    await acquireHubToken("https://hub.example", publicKeyHex(seed), seed, 0, 0);
    const bound = boundAuthChallengeSigningBytes(hubKey, hexToBytes(challenge));
    expect(ed25519.verify(hexToBytes(verifyBody.signature), bound, hexToBytes(publicKeyHex(seed)))).toBe(true);
  });
});
