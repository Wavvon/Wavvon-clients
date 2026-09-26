import { hubFetchWithToken } from "./http";
import { activeSession, allSessions, type HubSession } from "./session";
import { getHomeHubDesignation } from "./commands/identity";
import { loadIdentity, masterPubkeyOf } from "../identity/store";

// Which hub a DM lives on.
//
// It is the **home hub**, not whichever hub happens to be on screen
// (home-hub.md, "DM delivery"). A sender's hub walks the recipient's
// designation, so an inbound DM lands on a home hub — and reading from the
// active hub instead meant a user who signed in somewhere, drifted to another
// community and stayed there simply never saw those messages. They were
// delivered, stored, and invisible until the day that person happened to
// switch back.
//
// Reads prefer the first hub in the list we can actually reach (the list order
// is the user's preference; any entry is authoritative). With no designation,
// or none of its hubs open in this client, this falls back to the active hub —
// which is exactly the old behaviour, so a single-hub user notices nothing.

/** Cached per master pubkey: the designation is a network read, and this is on
 *  the path of every DM call. */
const cache = new Map<string, HubSession | null>();

/** Called when the session map is torn down (account switch, sign-out): the
 *  cached session objects belong to the account that just left. */
export function resetDmHubCache(): void {
  cache.clear();
}

function sessionForUrl(url: string): HubSession | undefined {
  const want = normalize(url);
  return allSessions().find((s) => normalize(s.hub_url) === want);
}

/** Compare hub URLs the way two spellings of one address should compare. */
function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * The session DM traffic should use.
 *
 * Never throws for want of a designation: a hub is always better than nothing,
 * and the active one is what every DM used before this existed.
 */
export async function dmSession(): Promise<HubSession> {
  const fallback = activeSession();
  const identity = await loadIdentity().catch(() => null);
  if (!identity) return fallback;

  const master = masterPubkeyOf(identity);
  const cached = cache.get(master);
  if (cached !== undefined) return cached ?? fallback;

  let resolved: HubSession | null = null;
  try {
    const designation = await getHomeHubDesignation(master);
    for (const url of designation?.hubs ?? []) {
      const session = sessionForUrl(url);
      // A lobby-scoped session cannot read /conversations at all, so treating
      // it as reachable would turn a working inbox into a 403.
      if (session && session.scope !== "lobby") {
        resolved = session;
        break;
      }
    }
  } catch {
    // No designation, or the hub that would serve it is unreachable. The
    // fallback below is the honest answer, and it is what happened before.
  }

  cache.set(master, resolved);
  return resolved ?? fallback;
}

/** `hubFetch`, pointed at the DM hub rather than the active one. */
export async function dmFetch(path: string, init?: RequestInit): Promise<Response> {
  const { hub_url, token } = await dmSession();
  return hubFetchWithToken(hub_url, token, path, init);
}

