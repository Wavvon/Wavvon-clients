import { loadSavedHubs } from "./storage";
import type { HubWebSocket } from "./ws";
import { resetDmHubCache } from "./dmHub";

export interface HubSession {
  hub_id: string;
  hub_url: string;
  hub_pubkey: string;
  hub_name: string;
  hub_icon: string | null;
  token: string;
  ws: HubWebSocket | null;
  /**
   * "lobby" while this session is confined to the lobby-survey.md
   * Feature 1 allowlist (the hub rejects a lobby-scoped token's WS
   * handshake, so `ws` is deliberately left null until promotion).
   * Defaults to "member" for every pre-lobby code path.
   */
  scope?: "member" | "lobby";
  /** `capabilities` from this hub's `/info` — see hubSupports() below. */
  capabilities?: string[];
  /** This hub's version string. Display only; gate on `capabilities`. */
  hub_version?: string;
}

const sessions = new Map<string, HubSession>();
let activeHubId: string | null = null;

export function getSession(hubId: string): HubSession | undefined {
  return sessions.get(hubId);
}

export function setSession(hubId: string, session: HubSession): void {
  sessions.set(hubId, session);
}

export function removeSession(hubId: string): void {
  sessions.delete(hubId);
}

export function allSessions(): HubSession[] {
  return Array.from(sessions.values());
}

// `sessions` and `activeHubId` are module-level singletons — they outlive a
// React remount (unlike component state, which resets by construction). An
// in-place account switch must close out every hub WebSocket the outgoing
// account had open and clear the pointer itself, or the incoming account's
// restorePersistedHubs() would layer new sessions on top of live ones nobody
// ever closed. Called once by AccountRoot's switch handler, before the new
// account's App instance mounts.
export function resetHubSessions(): void {
  // The DM hub is resolved from this map; a stale entry would point the next
  // account's DMs at the previous one's hub.
  resetDmHubCache();
  for (const s of sessions.values()) {
    s.ws?.close();
  }
  sessions.clear();
  activeHubId = null;
}

export function getActiveHubId(): string | null {
  return activeHubId;
}

export function setActiveHubId(id: string | null): void {
  activeHubId = id;
}

export function activeSession(): HubSession {
  if (!activeHubId) throw new Error("No active hub");
  const s = sessions.get(activeHubId);
  if (!s) throw new Error("Active hub has no session");
  return s;
}

/**
 * What a hub advertises, or `null` when we have not asked it yet.
 *
 * The null is load-bearing and not the same as `[]`. An empty array is a hub
 * that answered and advertised nothing — it predates capability advertising,
 * which is a fact about the hub. `null` is a hub saved before this client
 * recorded the field at all, which is a fact about *us*. Anything choosing a
 * request strategy has to tell those apart: guessing "old hub" about a modern
 * one silently gets a worse answer.
 */
export function hubCapabilities(hubId: string): string[] | null {
  const live = sessions.get(hubId)?.capabilities;
  if (live) return live;
  return loadSavedHubs().find((h) => h.hub_id === hubId)?.capabilities ?? null;
}

/**
 * Does this hub advertise `capability`?
 *
 * THE way to decide whether to offer a feature against a given hub — never
 * compare version strings. This client is multi-hub and the copy the user
 * loaded was served by whichever hub they happened to open, so it routinely
 * talks to hubs older and newer than itself; a version comparison would also
 * break on forks, backports and custom builds. See decisions.md, "Hub
 * capabilities are advertised, not inferred from a version number".
 *
 * Live session first, then the persisted last-known list so the answer is
 * right on the first frame after a reload. Unknown → false, which is the safe
 * direction *for rendering*: the feature is absent rather than erroring on a
 * route that is not there. Code choosing between two request strategies wants
 * `hubCapabilities` instead — for that question "unknown" and "no" differ.
 */
export function hubSupports(hubId: string, capability: string): boolean {
  return hubCapabilities(hubId)?.includes(capability) ?? false;
}

/** Same question about the active hub. False when there is no active hub. */
export function activeHubSupports(capability: string): boolean {
  return activeHubId ? hubSupports(activeHubId, capability) : false;
}

/** `hubCapabilities` for the active hub; null when there is no active hub. */
export function activeHubCapabilities(): string[] | null {
  return activeHubId ? hubCapabilities(activeHubId) : null;
}

// Returns hub_url + token for the active session (screen-share uses this).
export function get_hub_ws_info(): { hub_url: string; token: string } {
  const s = activeSession();
  return { hub_url: s.hub_url, token: s.token };
}
