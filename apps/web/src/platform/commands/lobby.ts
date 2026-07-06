import { hubFetch, rawFetch, HubApiError } from "../http";

export interface LobbyStatus {
  status: "member" | "lobby" | "none";
  required_level: number;
  current_level: number;
  entered_at: number | null;
  welcome_md: string | null;
}

export interface LobbyWelcome {
  welcome_md: string;
  hub_name: string;
  required_level: number;
}

export interface SubmitPowResult {
  promoted: boolean;
  new_level: number;
}

// Active-hub variants (used once the lobby screen is mounted for the
// current session).
export async function getLobbyStatus(): Promise<LobbyStatus> {
  const r = await hubFetch("/lobby/status");
  return r.json() as Promise<LobbyStatus>;
}

export async function getLobbyWelcome(): Promise<LobbyWelcome> {
  const r = await hubFetch("/lobby/welcome");
  return r.json() as Promise<LobbyWelcome>;
}

export async function submitLobbyPow(powProof: string): Promise<SubmitPowResult> {
  const r = await hubFetch("/lobby/submit-pow", {
    method: "POST",
    body: JSON.stringify({ pow_proof: powProof }),
  });
  return r.json() as Promise<SubmitPowResult>;
}

// Un-activated variant — probes a hub+token pair that isn't necessarily the
// active session yet (join time, or startup restore before a hub has been
// picked as active). Used only to decide whether it's safe to open the
// hub's WebSocket: a lobby-scoped token is rejected by the hub's WS
// handshake, so opening it eagerly would spin the reconnect/reauth loop
// forever. Treats anything other than a confirmed "member" as "don't open
// the socket yet" — the lobby screen's own /lobby/status poll and the
// regular 403 fallback in loadHubData() correct any false positive (e.g. an
// owner on a hub with a PoW gate) on the very next load.
export async function probeSessionScope(hubUrl: string, token: string): Promise<"member" | "lobby"> {
  try {
    const res = await rawFetch(`${hubUrl}/lobby/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = (await res.json()) as LobbyStatus;
    return status.status === "member" ? "member" : "lobby";
  } catch (e) {
    // 403 lobby_scope_confined never happens here (this route is
    // lobby-allowed); a 404/network error means no lobby feature at all.
    if (e instanceof HubApiError) return "member";
    return "member";
  }
}

/** True when a hub response body is exactly the lobby-confinement 403. */
export function isLobbyScopeConfined(e: unknown): boolean {
  return e instanceof HubApiError && e.status === 403 && e.message === "lobby_scope_confined";
}
