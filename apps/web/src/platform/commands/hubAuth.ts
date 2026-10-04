import { hexToBytes, signBytes } from "@wavvon/core";
import { rawFetch, hubFetchWithToken, HubApiError } from "../http";
import { resolveSessionScope } from "@wavvon/ui";

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
  // is below min_security_level (lobby-survey.md Feature 1); "member"
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
  alliance_voice_grant?: unknown,
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
  // Voice in an alliance channel: a grant our own hub signed, which this hub
  // redeems for a voice-only session (alliances.md). Ignored by a hub that
  // already has a users row for us — a member session is strictly better, and
  // the hub says so by answering with scope "member".
  if (alliance_voice_grant) body["alliance_voice_grant"] = alliance_voice_grant;

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

// A farm token carries no invite, and on an invite-only hub the hub refuses a
// non-member holding one. Probe first rather than redeeming blindly: /join/{code}
// spends an invite use even for a member. Without a code the 403 is rethrown,
// the same error /auth/verify gives a hub reached directly. Any other probe
// failure is left for the first real request to report, as before.
export async function admitFarmToken(
  hub_url: string,
  token: string,
  invite_code?: string,
): Promise<void> {
  try {
    await hubFetchWithToken(hub_url, token, "/me");
  } catch (e) {
    if (!(e instanceof HubApiError && e.status === 403 && /requires an invite code/i.test(e.message))) return;
    if (!invite_code) throw e;
    await hubFetchWithToken(hub_url, token, `/join/${encodeURIComponent(invite_code)}`, { method: "POST" });
  }
}
