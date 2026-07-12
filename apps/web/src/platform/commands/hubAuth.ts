import { hexToBytes, signBytes } from "@wavvon/core";
import { rawFetch } from "../http";
import { resolveSessionScope } from "../../utils/lobbyDecision";

// Token-acquisition core for the Ed25519 challenge-response auth flow
// (hub/src/auth/handlers.rs). Factored out of commands/hubs.ts so
// hubFetchAs.ts (background token acquisition for a non-active local
// account) can reuse it without duplicating the challenge/sign/verify
// dance.

interface ChallengeResponse {
  challenge: string;
}

interface VerifyResponse {
  token: string;
  canonical_pubkey?: string;
  // "lobby" when the hub's lobby is enabled and this identity's PoW level
  // is below min_security_level (lobby-bot-survey.md Feature 1); "member"
  // (or absent, for hubs predating the lobby) otherwise.
  scope?: string;
}

export interface HubTokenResult {
  token: string;
  canonicalPubkey?: string;
  scope: "member" | "lobby";
}

export async function acquireHubToken(
  auth_url: string,
  pubkeyHex: string,
  seedHex: string,
  security_nonce: number,
  security_level: number,
  invite_code?: string,
  subkey_cert?: unknown,
): Promise<HubTokenResult> {
  const challengeRes: ChallengeResponse = await rawFetch(
    `${auth_url}/auth/challenge`,
    { method: "POST", body: JSON.stringify({ public_key: pubkeyHex }) },
  ).then((r) => r.json() as Promise<ChallengeResponse>);

  const challengeBytes = hexToBytes(challengeRes.challenge);
  const signatureHex = signBytes(challengeBytes, seedHex);

  const body: Record<string, unknown> = {
    public_key: pubkeyHex,
    challenge: challengeRes.challenge,
    signature: signatureHex,
    security_nonce,
    security_level,
  };
  if (invite_code) body["invite_code"] = invite_code;
  // Multi-device: presenting the cert lets the hub resolve this subkey to the
  // shared canonical identity (see resolve_canonical_identity in the hub).
  if (subkey_cert) body["subkey_cert"] = subkey_cert;

  const verifyRes: VerifyResponse = await rawFetch(`${auth_url}/auth/verify`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<VerifyResponse>);

  return {
    token: verifyRes.token,
    canonicalPubkey: verifyRes.canonical_pubkey,
    scope: resolveSessionScope(verifyRes.scope),
  };
}
