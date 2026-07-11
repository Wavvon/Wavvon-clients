// Pure decision logic for the lobby soft-landing flow (lobby-bot-survey.md
// Feature 1). Extracted out of components/layout/Lobby.tsx and
// platform/commands/hubs.ts so the fork points that decide "are we confined,
// and when do we stop being confined" are unit-testable without a live hub,
// a Worker, or a DOM.

export interface LobbyStatusLike {
  status: string;
  required_level: number;
  current_level: number;
}

export interface SubmitPowResultLike {
  promoted: boolean;
  new_level: number;
}

/**
 * Resolves the raw `scope` field an auth/verify (or cached-token probe)
 * response carries into the two states the client acts on. Anything other
 * than the literal "lobby" string — including `undefined` from a hub that
 * predates the lobby feature entirely — resolves to "member", which is the
 * safe default: a false "member" self-corrects on the next request via the
 * WS reconnect/reauth loop, while a false "lobby" would wrongly confine a
 * fully-admitted user.
 */
export function resolveSessionScope(rawScope: string | undefined | null): "member" | "lobby" {
  return rawScope === "lobby" ? "lobby" : "member";
}

/**
 * Decides which view the lobby screen should show from a fresh
 * `GET /lobby/status` response. Mirrors the hub's own `effective_status`
 * computation (routes/lobby.rs) so the client can promote itself the moment
 * status agrees, without waiting on a submit round-trip — covers "PoW
 * already satisfied" (current_level already meets required_level from a
 * prior session) and "hub has no gate at all" (required_level === 0).
 */
export function decideLobbyView(status: LobbyStatusLike): "active" | "promoted" {
  if (status.status === "member") return "promoted";
  if (status.required_level > 0 && status.current_level >= status.required_level) return "promoted";
  if (status.required_level === 0) return "promoted";
  return "active";
}

/**
 * Folds a `/lobby/submit-pow` response into the locally-tracked level.
 * `new_level` is monotonic on the hub, but a stale/duplicate response
 * arriving out of order over a flaky connection must not regress the UI —
 * hence the max rather than a plain assignment.
 */
export function applyPowSubmitResult(
  prevLevel: number,
  result: SubmitPowResultLike,
): { level: number; promoted: boolean } {
  return { level: Math.max(prevLevel, result.new_level), promoted: result.promoted };
}

export interface LobbyProgress {
  pct: number;
  etaMinutes: number;
}

/**
 * Progress-bar percentage and a rough ETA for the lobby card. `minutesPerLevel`
 * is a coarse, deliberately conservative estimate (no client-measured hash
 * rate is fed back in v1) — good enough for "about N minutes", not a
 * precise countdown.
 */
export function computeLobbyProgress(
  currentLevel: number,
  requiredLevel: number,
  minutesPerLevel = 2,
): LobbyProgress {
  if (requiredLevel <= 0) return { pct: 100, etaMinutes: 0 };
  const pct = Math.min(100, (currentLevel / requiredLevel) * 100);
  const etaMinutes = Math.max(0, (requiredLevel - currentLevel) * minutesPerLevel);
  return { pct, etaMinutes };
}
