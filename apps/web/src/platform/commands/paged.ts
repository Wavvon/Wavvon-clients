/**
 * Walk a hub list endpoint to exhaustion.
 *
 * The hub's list dialect is an array plus `limit` and a keyset `cursor` on the
 * previous page's last row. Everything on the client that reads one of these
 * wants the whole list — a member sidebar, an admin table, a pin panel — so a
 * page is never the answer, and stopping at the page size while saying nothing
 * is the truncation bug pagination was added to fix.
 *
 * `capabilities` is the hub's advertised list, and the `null` in it is
 * load-bearing (see `hubCapabilities`): a hub that predates the endpoint's
 * pagination ignores both parameters and answers with the whole unbounded
 * list, so walking pages against it would re-fetch that same response
 * `maxPages` times and return that many copies of every row. Only take the
 * one-shot branch when the hub has actually said it lacks the capability;
 * unknown pages instead, which is correct against a new hub and covered by the
 * stall guard against an old one.
 */
export async function fetchAllPages<T>(opts: {
  /** The hub's advertised capabilities — null when we have never asked it. */
  capabilities: string[] | null;
  /** The capability string that says this endpoint honours limit + cursor. */
  capability: string;
  pageSize: number;
  maxPages: number;
  /** The cursor value carried by a row — the field the keyset is built on. */
  cursorOf: (row: T) => string | undefined;
  /** Issue one request. `params` is null for the un-paged first call. */
  fetchPage: (params: URLSearchParams | null) => Promise<T[]>;
  /** Endpoint name, for the warnings. */
  label: string;
}): Promise<T[]> {
  if (opts.capabilities && !opts.capabilities.includes(opts.capability)) {
    return opts.fetchPage(null);
  }

  const all: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < opts.maxPages; page++) {
    const params = new URLSearchParams({ limit: String(opts.pageSize) });
    if (cursor) params.set("cursor", cursor);
    const rows = await opts.fetchPage(params);
    const next = rows.length > 0 ? opts.cursorOf(rows[rows.length - 1]) : undefined;

    // Stall guard: the keyset comparison is strict, so a hub honouring the
    // cursor can never hand back a page ending on the value we just sent. One
    // that does is ignoring the cursor, and every further page is this one
    // again.
    if (next !== undefined && next === cursor) {
      console.warn(`${opts.label}: hub is not advancing the cursor — stopping`);
      return all;
    }

    all.push(...rows);
    if (rows.length < opts.pageSize) return all;
    cursor = next;
    if (!cursor) return all;
  }

  console.warn(`${opts.label}: stopped at ${opts.maxPages} pages (${all.length} rows)`);
  return all;
}

/** The hub clamps every one of these lists to 500. */
export const LIST_PAGE_SIZE = 500;

// ponytail: 20k rows is more than any of these lists is expected to hold, and
// the cap only exists so a server that stops advancing the cursor cannot spin
// here forever. Raise it if a real hub ever gets that far.
export const LIST_MAX_PAGES = 40;

/** The capability gating limit + cursor on the lists paged in 2026-09. */
export const LIST_CURSOR_CAP = "list.cursor.lists";
