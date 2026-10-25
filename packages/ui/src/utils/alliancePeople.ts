import type { AlliancePerson } from "../types";

export const PEOPLE_PAGE_SIZE = 100;

export type PeopleErrorKind =
  | "not_available"
  | "peer_unsupported"
  | "rate_limited"
  | "peer_unreachable"
  | "other";

/** Duck-typed on `status`/`message` because ui cannot import the platform's
 *  HubApiError. The 409 body is checked too: any other 409 is not the
 *  "owner does not share its list" refusal and must not be reported as one. */
export function classifyPeopleError(e: unknown): PeopleErrorKind {
  const status = (e as { status?: number } | null)?.status;
  const message = e instanceof Error ? e.message : String(e);
  if (status === 404) return "not_available";
  if (status === 409 && message.includes("peer_unsupported")) return "peer_unsupported";
  if (status === 429) return "rate_limited";
  if (status === 502) return "peer_unreachable";
  return "other";
}

export interface PeopleState {
  people: AlliancePerson[];
  cursor: string | null;
}

export const EMPTY_PEOPLE: PeopleState = { people: [], cursor: null };

/** A short page is the last one; a full page may be followed by more, so the
 *  cursor stays set until a page comes back short. Never assumes one page is
 *  everything. */
export function appendPeoplePage(
  prev: PeopleState,
  page: AlliancePerson[],
  limit: number = PEOPLE_PAGE_SIZE,
): PeopleState {
  const seen = new Set(prev.people.map((p) => p.public_key));
  const fresh = page.filter((p) => !seen.has(p.public_key));
  const last = page[page.length - 1];
  return {
    people: [...prev.people, ...fresh],
    cursor: page.length >= limit && last ? last.public_key : null,
  };
}
