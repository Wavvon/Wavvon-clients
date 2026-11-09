import {
  AUTH_CHALLENGE_SCHEME,
  BOUND_AUTH_CHALLENGE_SCHEME,
  authChallengeSigningBytes,
  boundAuthChallengeSigningBytes,
  hexToBytes,
  signBytes,
} from "@wavvon/core";
import { rawFetch, hubFetchWithToken, HubApiError } from "../http";
import { resolveSessionScope } from "@wavvon/ui";

// Token-acquisition core for the Ed25519 challenge-response auth flow
// (hub/src/auth/handlers.rs). Factored out of commands/hubs.ts so
// hubFetchAs.ts (background token acquisition for a non-active local
// account) can reuse it without duplicating the challenge/sign/verify
// dance.

interface ChallengeResponse {
  challenge: string;
  /** "tagged-v2" from a current hub or farm, "tagged-v1" from an older one. */
  scheme?: string;
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

/** The public key of the server at `base`: a hub's /info, or a farm's
 *  /farm/info when `base` is a farm. */
async function serverKeyAt(base: string): Promise<string> {
  for (const path of ["/info", "/farm/info"]) {
    try {
      const res = await rawFetch(`${base}${path}`);
      const key = ((await res.json()) as { public_key?: unknown }).public_key;
      if (typeof key === "string" && key) return key;
    } catch {
      // Not this kind of server; try the other.
    }
  }
  throw new Error(`Cannot learn the public key of ${base} to sign in`);
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
  challenge_token?: string,
): Promise<HubTokenResult> {
  const challengeRes: ChallengeResponse = await rawFetch(
    `${auth_url}/auth/challenge`,
    { method: "POST", body: JSON.stringify({ public_key: pubkeyHex }) },
  ).then((r) => r.json() as Promise<ChallengeResponse>);

  const challengeBytes = hexToBytes(challengeRes.challenge);
  // The same key signs envelopes, messages and certs. A Wavvon hub issues
  // exactly 32 random bytes, and everything else this key signs is longer,
  // so a hub asking for anything else is asking for a signature it could
  // replay as one of those (Wavvon-server#111).
  if (challengeBytes.length !== 32) {
    throw new Error(`Refusing to sign a ${challengeBytes.length}-byte auth challenge`);
  }
  // Only a tagged answer: a raw signature over hub-chosen bytes is the
  // oracle the tag exists to close. A current server wants it bound to its
  // key, which comes from the server at auth_url itself, never from the
  // challenge: a hub relaying another server's challenge then gets an answer
  // naming itself.
  let signed: Uint8Array;
  if (challengeRes.scheme === BOUND_AUTH_CHALLENGE_SCHEME) {
    signed = boundAuthChallengeSigningBytes(await serverKeyAt(auth_url), challengeBytes);
  } else if (challengeRes.scheme === AUTH_CHALLENGE_SCHEME) {
    signed = authChallengeSigningBytes(challengeBytes);
  } else {
    throw new Error(`Refusing to answer an auth challenge with scheme ${String(challengeRes.scheme)}`);
  }
  const signatureHex = signBytes(signed, seedHex);

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
  // The hub's anti-spam check (challenge_mode), passed just before joining.
  if (challenge_token) body["challenge_token"] = challenge_token;

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
