import type { HubWebSocket } from "./ws";

export interface HubSession {
  hub_id: string;
  hub_url: string;
  hub_pubkey: string;
  hub_name: string;
  hub_icon: string | null;
  token: string;
  ws: HubWebSocket | null;
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
