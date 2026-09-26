import { hubFetch } from "../http";
import { activeHubCapabilities } from "../session";
import { fetchAllPages } from "./paged";
import type { User } from "@wavvon/ui";

/** The hub's `USERS_MAX_LIMIT`. Asking for more is clamped server-side. */
const PAGE_SIZE = 500;

// ponytail: bounded at 20k members so a server that stopped advancing the
// cursor can't spin here forever. The keyset uses a strict `>` so it cannot
// legitimately repeat a row; raise this if a hub ever gets that big.
const MAX_PAGES = 40;

/**
 * The full member roster.
 *
 * `GET /users` is paginated (keyset cursor on the previous page's last
 * `public_key`), and everything on the client that reads it — the member
 * sidebar, message-author name resolution, the admin Users table — wants
 * every member, not a page. So this walks pages until a short one comes
 * back. Truncating at the page size and saying nothing is precisely the bug
 * the endpoint's pagination was added to fix (member lists used to stop at
 * the hub's hardcoded 50); it would be a poor trade to reintroduce it at a
 * higher number.
 */
export async function fetchAllUsers(): Promise<User[]> {
  // Version skew, handled the decided way — by capability, not by version
  // (decisions.md). A hub that predates keyset pagination ignores both `limit`
  // and `cursor` and answers with the whole unbounded roster, so one plain
  // request there is not a truncation, it is the complete list; walking pages
  // against it would re-fetch that same response MAX_PAGES times and hand back
  // 40 copies of every member. That reasoning, the stall guard and the page
  // walk all live in `fetchAllPages` now — the same shape serves every list
  // the hub pages, and `/users` was the first of them.
  //
  // Note the capability *list* rather than hubSupports: a hub saved by a build
  // older than capability advertising reports "unknown", and guessing "old"
  // about a modern hub would send an unparameterised /users and silently keep
  // its first 200 members.
  return fetchAllPages<User>({
    capabilities: activeHubCapabilities(),
    capability: "list.cursor",
    pageSize: PAGE_SIZE,
    maxPages: MAX_PAGES,
    cursorOf: (u) => u.public_key,
    fetchPage: async (params) =>
      (await (await hubFetch(params ? `/users?${params}` : "/users")).json()) as User[],
    label: "fetchAllUsers",
  });
}
