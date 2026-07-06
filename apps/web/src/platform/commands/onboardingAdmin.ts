import { hubFetch } from "../http";

// --- Lobby (admin) ---

export interface PendingUser {
  public_key: string;
  display_name: string | null;
  first_seen_at: number;
}

export async function setLobbySettings(lobbyEnabled: boolean, welcomeMd?: string): Promise<void> {
  await hubFetch("/hub/settings/lobby", {
    method: "PUT",
    body: JSON.stringify({ lobby_enabled: lobbyEnabled, welcome_md: welcomeMd }),
  });
}

// Approval queue: users awaiting admission (require_approval hubs).
export async function listPendingUsers(): Promise<PendingUser[]> {
  const r = await hubFetch("/hub/pending");
  return r.json() as Promise<PendingUser[]>;
}

export async function approvePendingUser(pubkey: string): Promise<void> {
  await hubFetch(`/hub/pending/${pubkey}/approve`, { method: "POST" });
}

// --- Anti-spam challenge (admin, write-only: there is no GET for these) ---

export type ChallengeMode = "off" | "click" | "puzzle" | "both";
export type ChallengeDifficulty = "easy" | "medium";

export async function setChallengeSettings(
  mode: ChallengeMode,
  difficulty: ChallengeDifficulty,
): Promise<void> {
  await hubFetch("/hub/settings/challenge", {
    method: "PUT",
    body: JSON.stringify({ challenge_mode: mode, challenge_difficulty: difficulty }),
  });
}
