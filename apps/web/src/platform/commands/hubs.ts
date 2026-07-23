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
  updateSavedHub,
  saveActiveHubId,
  saveToken,
  clearToken,
  type SavedHub,
} from "../storage";
import { loadIdentity, saveIdentity } from "../../identity/store";
import { publicKeyHex } from "@wavvon/core";
import type { Hub } from "@shared/types";
import { probeSessionScope } from "./lobby";
import { acquireHubToken as authenticate } from "./hubAuth";

interface InfoResponse {
  public_key: string;
  name: string;
  icon: string | null;
  farm_url?: string | null;
  welcome_label?: string | null;
  welcome_invite_url?: string | null;
  /** SHA-256 hex of the LAN self-signed cert, present when lan_tls === "self". */
  lan_fingerprint?: string | null;
}

function authBaseUrl(info: InfoResponse, hub_url: string): string {
  return info.farm_url ?? hub_url;
}


export async function addHub(
  hub_url: string,
  handlers: WsHandlers,
  opts?: { invite_code?: string; rememberMe?: boolean; sessionToken?: string },
): Promise<Hub> {
  const url = hub_url.replace(/\/$/, "");

  const info: InfoResponse = await rawFetch(`${url}/info`).then(
    (r) => r.json() as Promise<InfoResponse>,
  );

  let token: string;
  // "member" is the safe default for the sessionToken (webauthn) path below,
  // where we don't get a scope back directly — a wrong "member" guess just
  // means the WS handshake gets rejected once and self-corrects via
  // onReauthNeeded, which re-authenticates through the full identity flow
  // and does learn the real scope.
  let scope: "member" | "lobby" = "member";
  if (opts?.sessionToken) {
    token = opts.sessionToken;
    scope = await probeSessionScope(url, token);
  } else {
    const identity = await loadIdentity();
    if (!identity) throw new Error("No identity — generate one first");

    const res = await authenticate(
      authBaseUrl(info, url),
      publicKeyHex(identity.seed_hex),
      identity.seed_hex,
      identity.security_nonce,
      identity.security_level,
      opts?.invite_code,
      identity.subkey_cert,
    );
    token = res.token;
    scope = res.scope;

    // Paired device: persist the canonical identity the hub attributes our
    // actions to, so the UI self-identifies as the shared user rather than
    // this device's own subkey pubkey.
    if (
      identity.subkey_cert &&
      res.canonicalPubkey &&
      res.canonicalPubkey !== publicKeyHex(identity.seed_hex) &&
      identity.canonical_pubkey !== res.canonicalPubkey
    ) {
      await saveIdentity({ ...identity, canonical_pubkey: res.canonicalPubkey });
    }
  }

  const rememberMe = opts?.rememberMe ?? false;
  saveToken(info.public_key, token, rememberMe);

  // A lobby-scoped token is rejected by the hub's WS handshake (no
  // channels/voice/presence in the lobby) — opening it here would just spin
  // the reconnect/reauth loop. The socket is opened later by
  // connectHubWebSocket() once /lobby/submit-pow reports promotion.
  const ws = scope === "lobby" ? null : new HubWebSocket(url, token, info.public_key, handlers);

  const session: HubSession = {
    hub_id: info.public_key,
    hub_url: url,
    hub_pubkey: info.public_key,
    hub_name: info.name,
    hub_icon: info.icon,
    token,
    ws,
    scope,
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

// Chokepoint for syncing a hub's name+icon from its /info into both the live
// session and the localStorage SavedHub — used by the post-admin-save sync,
// the hub_updated WS handler, and the loadHubData self-heal, so none of them
// re-implement the fetch. Returns the fetched info (incl. timezone, read by
// loadHubData) or null if the hub has no session or the fetch failed.
export async function refreshHubInfo(
  hub_id: string,
): Promise<{ name: string; icon: string | null; timezone: string | null } | null> {
  const s = getSession(hub_id);
  if (!s) return null;
  try {
    const info = await rawFetch(`${s.hub_url}/info`).then(
      (r) => r.json() as Promise<InfoResponse & { timezone?: string | null }>,
    );
    setSession(hub_id, { ...s, hub_name: info.name, hub_icon: info.icon });
    updateSavedHub(hub_id, info.name, info.icon);
    return { name: info.name, icon: info.icon, timezone: info.timezone ?? null };
  } catch {
    return null;
  }
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

// Re-authenticate the active hub presenting the stored subkey cert, refreshing
// the session token in place (the existing WebSocket stays valid). Called right
// after enabling multi-device so the hub records the master on this user's row
// immediately — a prerequisite for a newly paired device to resolve to the same
// canonical identity. No-op if the identity has no cert or no active hub.
export async function upgradeActiveHubIdentity(): Promise<void> {
  const identity = await loadIdentity();
  if (!identity?.subkey_cert) return;
  const hub_id = getActiveHubId();
  if (!hub_id) return;
  const s = getSession(hub_id);
  if (!s) return;

  const info: InfoResponse = await rawFetch(`${s.hub_url}/info`).then(
    (r) => r.json() as Promise<InfoResponse>,
  );
  const res = await authenticate(
    authBaseUrl(info, s.hub_url),
    publicKeyHex(identity.seed_hex),
    identity.seed_hex,
    identity.security_nonce,
    identity.security_level,
    undefined,
    identity.subkey_cert,
  );
  saveToken(hub_id, res.token, true);
  setSession(hub_id, { ...s, token: res.token });
  if (
    res.canonicalPubkey &&
    res.canonicalPubkey !== publicKeyHex(identity.seed_hex) &&
    identity.canonical_pubkey !== res.canonicalPubkey
  ) {
    await saveIdentity({ ...identity, canonical_pubkey: res.canonicalPubkey });
  }
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
  const { token, scope } = await authenticate(
    authBaseUrl(info, s.hub_url),
    pubkeyHex,
    seedHex,
    identity.security_nonce,
    identity.security_level,
    undefined,
    identity.subkey_cert,
  );

  s.ws?.close();
  // A fresh handshake landing back in "lobby" (e.g. the previous session
  // was wrongly assumed "member" via the sessionToken path in addHub, or
  // min_security_level was raised after the original join) must not reopen
  // the WS — that's exactly the reconnect storm this scope check prevents.
  const ws = scope === "lobby" ? null : new HubWebSocket(s.hub_url, token, hub_id, handlers);
  setSession(hub_id, { ...s, token, ws, scope });
}

// Opens the hub's WebSocket for a session that was deliberately left
// disconnected because it was lobby-scoped (see addHub/reauthorizeHub).
// Called once /lobby/submit-pow reports promotion — the same token that was
// rejected moments ago is now valid for the WS, no re-auth needed.
export function connectHubWebSocket(hub_id: string, handlers: WsHandlers): void {
  const s = getSession(hub_id);
  if (!s || s.ws) return;
  const ws = new HubWebSocket(s.hub_url, s.token, hub_id, handlers);
  setSession(hub_id, { ...s, ws, scope: "member" });
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

// LAN fingerprint pinning (lan-mode.md §5): TOFU-verify the hub's
// self-reported /info fingerprint against the one carried out-of-band in
// the invite URL. `undefined` expectedFingerprint means the invite carried
// none — always passes, so normal (non-LAN) hubs are unaffected. Shared by
// every add-hub call site (App.tsx, WelcomeScreenContainer) so none of them
// can silently skip the check.
export async function verifyLanFingerprint(
  hub_url: string,
  expectedFingerprint: string | undefined,
): Promise<boolean> {
  if (!expectedFingerprint) return true;
  const info = await previewHubInfo(hub_url);
  return (info.lan_fingerprint ?? "").toLowerCase() === expectedFingerprint;
}

export async function previewHubInfo(hub_url: string): Promise<{
  name: string;
  public_key: string;
  icon: string | null;
  welcome_label: string | null;
  welcome_invite_url: string | null;
  lan_fingerprint: string | null;
}> {
  const url = hub_url.replace(/\/$/, "");
  const info: InfoResponse = await rawFetch(`${url}/info`).then((r) => r.json() as Promise<InfoResponse>);
  return {
    name: info.name,
    public_key: info.public_key,
    icon: info.icon,
    welcome_label: info.welcome_label ?? null,
    welcome_invite_url: info.welcome_invite_url ?? null,
    lan_fingerprint: info.lan_fingerprint ?? null,
  };
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
      // Cached tokens don't carry a scope, so it has to be re-probed on
      // every restore — a stale "member" assumption for a cached lobby
      // token would open a WS the hub immediately rejects.
      let scope: "member" | "lobby" = "member";
      if (!token) {
        const hubInfo: InfoResponse = await rawFetch(`${hub.hub_url}/info`).then(
          (r) => r.json() as Promise<InfoResponse>,
        );
        const authRes = await authenticate(
          authBaseUrl(hubInfo, hub.hub_url),
          pubkeyHex,
          seedHex,
          identity.security_nonce,
          identity.security_level,
          undefined,
          identity.subkey_cert,
        );
        token = authRes.token;
        scope = authRes.scope;
        if (
          identity.subkey_cert &&
          authRes.canonicalPubkey &&
          authRes.canonicalPubkey !== pubkeyHex &&
          identity.canonical_pubkey !== authRes.canonicalPubkey
        ) {
          await saveIdentity({ ...identity, canonical_pubkey: authRes.canonicalPubkey });
        }
        saveToken(hub.hub_id, token, hub.remember_token);
      } else {
        scope = await probeSessionScope(hub.hub_url, token);
      }

      const ws = scope === "lobby" ? null : new HubWebSocket(hub.hub_url, token, hub.hub_id, handlers);
      setSession(hub.hub_id, {
        hub_id: hub.hub_id,
        hub_url: hub.hub_url,
        hub_pubkey: hub.hub_id,
        hub_name: hub.hub_name,
        hub_icon: hub.hub_icon,
        token,
        ws,
        scope,
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
