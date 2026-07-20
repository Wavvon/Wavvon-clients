import { publicKeyHex } from "@wavvon/core";
import { hubFetch, hubFetchWithToken, rawFetch } from "./http";
import { activeSession } from "./session";
import { loadToken, saveToken } from "./storage";
import { acquireHubToken } from "./commands/hubAuth";
import { getActiveAccountId, type IdentityRecord } from "../identity/store";

interface InfoResponse {
  public_key: string;
  farm_url?: string | null;
}

async function tokenForAccount(account: IdentityRecord, hub_url: string, hub_id: string): Promise<string> {
  const cached = loadToken(hub_id, account.id);
  if (cached) return cached;

  const info: InfoResponse = await rawFetch(`${hub_url}/info`).then((r) => r.json() as Promise<InfoResponse>);
  const auth_url = info.farm_url ?? hub_url;
  const pubkeyHex = publicKeyHex(account.seed_hex);
  const res = await acquireHubToken(
    auth_url,
    pubkeyHex,
    account.seed_hex,
    account.security_nonce,
    account.security_level,
    undefined,
    account.subkey_cert,
  );
  // Not "remember me" — this token was acquired transparently in the
  // background, not through a flow the user saw a remember-me choice for.
  saveToken(hub_id, res.token, false, account.id);
  return res.token;
}

// Authenticated fetch against the ACTIVE hub, but presenting whichever local
// account is being MANAGED rather than the one currently switched into (see
// AccountTab.tsx's "Managing" selector). This is the mechanism behind
// "manage any on-device account without switching" for hub-side state that
// is session-bound (dm-blocks, passkeys, trusted devices) rather than
// signature-authoritative (home hubs, device certs — those just get signed
// locally with the selected account's own master seed and don't need this).
//
// When the selected account IS the active one this is just hubFetch — no
// separate token, no separate session, nothing extra cached.
export async function hubFetchAs(
  account: IdentityRecord,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (account.id === getActiveAccountId()) {
    return hubFetch(path, init);
  }
  const { hub_url, hub_id } = activeSession();
  const token = await tokenForAccount(account, hub_url, hub_id);
  return hubFetchWithToken(hub_url, token, path, init);
}
