import { publicKeyHex } from "@wavvon/core";
import { hubFetch, rawFetch, HubApiError } from "../http";
import { HubWebSocket, type WsHandlers } from "../ws";
import { acquireHubToken } from "./hubAuth";
import { publishDhKeyTo } from "./dms";
import { loadIdentity } from "../../identity/store";

// Voice in an alliance channel (alliances.md, "Voice in alliance channels").
//
// The owning hub's relay *is* the room, and a visitor dials it directly: our
// hub signs a grant saying "this pubkey is my member and that channel is
// shared with us", the owning hub re-checks everything against its own view
// and hands back a voice-only session. Nothing about the relay, the sender-id
// space or the datagram format changes — the visitor is an ordinary pubkey in
// the owner's maps.
//
// This module owns the two hops the normal join does not have: minting the
// grant here, and standing up a second, voice-only hub session over there.

/** Opaque to us: only the two hubs read the payload. We carry it across. */
export type AllianceVoiceGrant = unknown;

export interface MintedVoiceGrant {
  grant: AllianceVoiceGrant;
  owner_hub_url: string;
  owner_hub_pubkey: string;
  channel_name: string;
}

/** The owning hub does not do alliance voice, so there is no room to dial. */
export class OwnerHubUnsupportedError extends Error {
  constructor(public hubUrl: string) {
    super("owner_hub_no_alliance_voice");
  }
}

export async function mintAllianceVoiceGrant(
  allianceId: string,
  channelId: string,
): Promise<MintedVoiceGrant> {
  const r = await hubFetch(`/alliances/${allianceId}/voice-grant`, {
    method: "POST",
    body: JSON.stringify({ channel_id: channelId }),
  });
  return r.json() as Promise<MintedVoiceGrant>;
}

/**
 * A voice-only session on someone else's hub: its own token, its own socket,
 * held for exactly as long as the call.
 *
 * Deliberately NOT in the session map — it is not a hub the user joined, has
 * no `users` row over there, and everything that walks `allSessions()` (hub
 * list, restore, DM delivery, account switch) would be wrong about it.
 */
export interface AllianceVoiceVisit {
  hubUrl: string;
  hubPubkey: string;
  hubName: string;
  token: string;
  ws: HubWebSocket;
  close: () => void;
}

interface InfoResponse {
  public_key: string;
  name?: string;
  farm_url?: string | null;
  capabilities?: string[];
}

/**
 * Mint, redeem, and open the socket. The caller then sends `voice_join` on
 * `ws` exactly as it would on its own hub's socket.
 *
 * The owner's capability is checked here rather than at render time: the
 * affordance is gated on *our* hub advertising `voice.alliance` (which we
 * already know, at no cost), and asking every allied hub for its `/info` on
 * every load to gate the other half would be a request storm for a button
 * almost nobody presses. The refusal is named, so the caller can say which
 * hub is the one that cannot.
 */
export async function openAllianceVoiceVisit(
  minted: MintedVoiceGrant,
  handlers: WsHandlers,
): Promise<AllianceVoiceVisit> {
  // Ask the owner what it does before touching the identity: a hub that does
  // not do alliance voice gets no signature from us at all.
  const info: InfoResponse = await rawFetch(`${minted.owner_hub_url}/info`).then(
    (r) => r.json() as Promise<InfoResponse>,
  );
  if (!info.capabilities?.includes("voice.alliance")) {
    throw new OwnerHubUnsupportedError(minted.owner_hub_url);
  }

  const identity = await loadIdentity();
  if (!identity) throw new Error("No identity");

  // Same rule as every other join: a farm-hosted hub authenticates through
  // the farm, and the hub tells us so on /info.
  const authUrl = info.farm_url ?? minted.owner_hub_url;
  const { token } = await acquireHubToken(
    authUrl,
    publicKeyHex(identity.seed_hex),
    identity.seed_hex,
    identity.security_nonce,
    identity.security_level,
    undefined,
    identity.subkey_cert,
    minted.grant,
  );

  // Before the socket, because a key offer can arrive the moment we join and
  // whoever sends it needs our DH key readable *here*. Not best-effort: a
  // failed publish means a room we can talk into and hear nothing from, which
  // is worse than a refused join that says so.
  await publishDhKeyTo(minted.owner_hub_url, token);

  const ws = new HubWebSocket(minted.owner_hub_url, token, minted.owner_hub_pubkey, handlers);
  // Not returned until it is open. The caller sends `voice_join` on the next
  // microtask and `HubWebSocket.send` drops frames on a socket that is still
  // CONNECTING — so before this wait, alliance voice minted a grant, redeemed
  // it, opened the socket, threw the join away and reported "Voice join timed
  // out" ten seconds later. Every time, on every hub.
  try {
    await ws.whenOpen();
  } catch (e) {
    ws.close();
    throw e;
  }
  return {
    hubUrl: minted.owner_hub_url,
    hubPubkey: minted.owner_hub_pubkey,
    hubName: info.name ?? minted.owner_hub_url,
    token,
    ws,
    close: () => ws.close(),
  };
}

