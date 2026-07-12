import type { HubWebSocket } from "./ws";

export interface HubSession {
  hub_id: string;
  hub_url: string;
  hub_pubkey: string;
  hub_name: string;
  hub_icon: string | null;
  token: string;
  ws: HubWebSocket | null;
  /**
   * "lobby" while this session is confined to the lobby-bot-survey.md
   * Feature 1 allowlist (the hub rejects a lobby-scoped token's WS
   * handshake, so `ws` is deliberately left null until promotion).
   * Defaults to "member" for every pre-lobby code path.
   */
  scope?: "member" | "lobby";
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

// Returns hub_url + token for the active session (screen-share uses this).
export function get_hub_ws_info(): { hub_url: string; token: string } {
  const s = activeSession();
  return { hub_url: s.hub_url, token: s.token };
}
