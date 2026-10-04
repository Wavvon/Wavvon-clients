export type HubRefusalKind = "invite_required" | "banned" | "other";

export interface HubRefusal {
  kind: HubRefusalKind;
  reason: string;
}

// 403 bodies that mean "this session is confined", not "the hub refused you":
// each has its own screen or is a scope guard on a route the shell never loads.
const NOT_A_REFUSAL = [
  "lobby_scope_confined",
  "mini_app_scope_confined",
  "alliance_voice_scope",
  "Account is pending admin approval",
];

/** Reads a failed hub request. Only an HTTP 403 can be a refusal — a network
 *  error or 5xx says nothing about admission, so it must stay "unknown". */
export function classifyHubRefusal(status: number, message: string): HubRefusal | null {
  if (status !== 403 || NOT_A_REFUSAL.includes(message)) return null;
  if (message === "This hub requires an invite code") return { kind: "invite_required", reason: message };
  if (message === "User is banned" || message === "Access denied") return { kind: "banned", reason: message };
  return { kind: "other", reason: message };
}
