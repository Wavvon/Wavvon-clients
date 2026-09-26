import { hubFetch } from "../http";
import { activeHubCapabilities } from "../session";
import { fetchAllPages, LIST_CURSOR_CAP, LIST_MAX_PAGES, LIST_PAGE_SIZE } from "./paged";

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
  return fetchAllPages<PendingUser>({
    capabilities: activeHubCapabilities(),
    capability: LIST_CURSOR_CAP,
    pageSize: LIST_PAGE_SIZE,
    maxPages: LIST_MAX_PAGES,
    cursorOf: (u) => u.public_key,
    fetchPage: async (params) =>
      (await (
        await hubFetch(params ? `/hub/pending?${params}` : "/hub/pending")
      ).json()) as PendingUser[],
    label: "listPendingUsers",
  });
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
