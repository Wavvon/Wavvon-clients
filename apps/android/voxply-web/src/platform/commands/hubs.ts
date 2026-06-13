import { rawFetch, hubFetch } from "../http";
import {
  getSession,
  setSession,
  removeSession,
  allSessions,
  getActiveHubId,
  setActiveHubId,
  type HubSession,
} from "../session";
import { HubWebSocket, type WsHandlers } from "../ws";
import {
  upsertSavedHub,
  removeSavedHub,
  saveActiveHubId,
  saveToken,
  clearToken,
  type SavedHub,
} from "../storage";
import { loadIdentity, loadPairedState, hexToBytes, bytesToHex } from "../../identity/store";
import { signBytes, publicKeyHex } from "../../identity/crypto";
import { ed25519 } from "@noble/curves/ed25519";
import type { Hub } from "@shared/types";

interface InfoResponse {
  public_key: string;
  name: string;
  icon: string | null;
  farm_url?: string | null;
}

interface ChallengeResponse {
  challenge: string;
}

interface VerifyResponse {
  token: string;
}

function authBaseUrl(info: InfoResponse, hub_url: string): string {
  return info.farm_url ?? hub_url;
}

async function authenticate(
  auth_url: string,
  pubkeyHex: string,
  seedHex: string,
  security_nonce: number,
  security_level: number,
  invite_code?: string,
): Promise<string> {
  const pairedState = await loadPairedState();

  const authPubkey = pairedState ? pairedState.cert.subkey_pubkey : pubkeyHex;

  const challengeRes: ChallengeResponse = await rawFetch(
    `${auth_url}/auth/challenge`,
    { method: "POST", body: JSON.stringify({ public_key: authPubkey }) },
  ).then((r) => r.json() as Promise<ChallengeResponse>);

  const challengeBytes = hexToBytes(challengeRes.challenge);

  let signatureHex: string;
  const body: Record<string, unknown> = {
    public_key: authPubkey,
    challenge: challengeRes.challenge,
    security_nonce,
    security_level,
  };

  if (pairedState) {
    const sig = ed25519.sign(challengeBytes, hexToBytes(pairedState.subkey_private_hex));
    signatureHex = bytesToHex(sig);
    body.subkey_cert = pairedState.cert;
  } else {
    signatureHex = signBytes(challengeBytes, seedHex);
  }

  body.signature = signatureHex;
  if (invite_code) body["invite_code"] = invite_code;

  const verifyRes: VerifyResponse = await rawFetch(`${auth_url}/auth/verify`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<VerifyResponse>);

  return verifyRes.token;
}

export async function addHub(
  hub_url: string,
  handlers: WsHandlers,
  opts?: { invite_code?: string; rememberMe?: boolean },
): Promise<Hub> {
  const url = hub_url.replace(/\/$/, "");

  const info: InfoResponse = await rawFetch(`${url}/info`).then(
    (r) => r.json() as Promise<InfoResponse>,
  );

  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity — generate one first");

  const seedHex = identity.seed_hex;
  const pubkeyHex = publicKeyHex(seedHex);

  const token = await authenticate(
    authBaseUrl(info, url),
    pubkeyHex,
    seedHex,
    identity.security_nonce,
    identity.security_level,
    opts?.invite_code,
  );

  const rememberMe = opts?.rememberMe ?? false;
  saveToken(info.public_key, token, rememberMe);

  const ws = new HubWebSocket(url, token, handlers);

  const session: HubSession = {
    hub_id: info.public_key,
    hub_url: url,
    hub_pubkey: info.public_key,
    hub_name: info.name,
    hub_icon: info.icon,
    token,
    ws,
  };
  setSession(info.public_key, session);

  if (!getActiveHubId()) {
    setActiveHubId(info.public_key);
    saveActiveHubId(info.public_key);
  }

  const saved: SavedHub = {
    hub_id: info.public_key,
    hub_name: info.name,
    hub_url: url,
    hub_icon: info.icon,
    remember_token: rememberMe,
  };
  upsertSavedHub(saved);

  const isActive = getActiveHubId() === info.public_key;
  return {
    hub_id: info.public_key,
    hub_name: info.name,
    hub_url: url,
    hub_icon: info.icon,
    is_active: isActive,
  };
}

export function listHubs(): Hub[] {
  return allSessions().map((s) => ({
    hub_id: s.hub_id,
    hub_name: s.hub_name,
    hub_url: s.hub_url,
    hub_icon: s.hub_icon,
    is_active: s.hub_id === getActiveHubId(),
  }));
}

export function setActiveHub(hub_id: string): void {
  if (!getSession(hub_id)) throw new Error("Hub not connected");
  setActiveHubId(hub_id);
  saveActiveHubId(hub_id);
}

export async function removeHub(hub_id: string): Promise<void> {
  const s = getSession(hub_id);
  s?.ws?.close();
  removeSession(hub_id);
  removeSavedHub(hub_id);
  clearToken(hub_id);

  if (getActiveHubId() === hub_id) {
    const remaining = allSessions();
    const next = remaining[0]?.hub_id ?? null;
    setActiveHubId(next);
    saveActiveHubId(next);
  }
}

export async function pingHub(hub_id: string): Promise<number> {
  const s = getSession(hub_id);
  if (!s) throw new Error("Hub not connected");
  const start = Date.now();
  await rawFetch(`${s.hub_url}/health`);
  return Date.now() - start;
}

export async function reauthorizeHub(
  hub_id: string,
  handlers: WsHandlers,
): Promise<void> {
  const s = getSession(hub_id);
  if (!s) throw new Error("Hub not connected");

  const info: InfoResponse = await rawFetch(`${s.hub_url}/info`).then(
    (r) => r.json() as Promise<InfoResponse>,
  );

  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");

  const seedHex = identity.seed_hex;
  const pubkeyHex = publicKeyHex(seedHex);
  const token = await authenticate(
    authBaseUrl(info, s.hub_url),
    pubkeyHex,
    seedHex,
    identity.security_nonce,
    identity.security_level,
  );

  s.ws?.close();
  const ws = new HubWebSocket(s.hub_url, token, handlers);
  setSession(hub_id, { ...s, token, ws });
}

export async function getHubInfo(hub_id: string): Promise<Hub | null> {
  const s = getSession(hub_id);
  if (!s) return null;
  return {
    hub_id: s.hub_id,
    hub_name: s.hub_name,
    hub_url: s.hub_url,
    hub_icon: s.hub_icon,
    is_active: s.hub_id === getActiveHubId(),
  };
}

export async function previewHubInfo(hub_url: string): Promise<{ name: string; public_key: string; icon: string | null }> {
  const url = hub_url.replace(/\/$/, "");
  const info: InfoResponse = await rawFetch(`${url}/info`).then((r) => r.json() as Promise<InfoResponse>);
  return { name: info.name, public_key: info.public_key, icon: info.icon };
}

export async function reorderHubs(hub_ids: string[]): Promise<void> {
  const { loadSavedHubs, saveSavedHubs } = await import("../storage");
  const saved = loadSavedHubs();
  const ordered = hub_ids
    .map((id) => saved.find((h) => h.hub_id === id))
    .filter(Boolean) as typeof saved;
  saveSavedHubs(ordered);
}

// Reconnect to persisted hubs from localStorage on app load.
export async function restorePersistedHubs(handlers: WsHandlers): Promise<Hub[]> {
  const { loadSavedHubs, loadToken, loadActiveHubId } = await import("../storage");
  const saved = loadSavedHubs();
  const result: Hub[] = [];

  const identity = await loadIdentity();
  if (!identity) return [];

  const seedHex = identity.seed_hex;
  const pubkeyHex = publicKeyHex(seedHex);
  const savedActiveId = loadActiveHubId();

  for (const hub of saved) {
    try {
      let token = loadToken(hub.hub_id);
      if (!token) {
        const hubInfo: InfoResponse = await rawFetch(`${hub.hub_url}/info`).then(
          (r) => r.json() as Promise<InfoResponse>,
        );
        token = await authenticate(
          authBaseUrl(hubInfo, hub.hub_url),
          pubkeyHex,
          seedHex,
          identity.security_nonce,
          identity.security_level,
        );
        saveToken(hub.hub_id, token, hub.remember_token);
      }

      const ws = new HubWebSocket(hub.hub_url, token, handlers);
      setSession(hub.hub_id, {
        hub_id: hub.hub_id,
        hub_url: hub.hub_url,
        hub_pubkey: hub.hub_id,
        hub_name: hub.hub_name,
        hub_icon: hub.hub_icon,
        token,
        ws,
      });

      result.push({
        hub_id: hub.hub_id,
        hub_name: hub.hub_name,
        hub_url: hub.hub_url,
        hub_icon: hub.hub_icon,
        is_active: hub.hub_id === savedActiveId,
      });
    } catch {
      // Skip unreachable hubs on startup
    }
  }

  if (savedActiveId && getSession(savedActiveId)) {
    setActiveHubId(savedActiveId);
  } else if (result.length > 0) {
    setActiveHubId(result[0].hub_id);
  }

  return result;
}
