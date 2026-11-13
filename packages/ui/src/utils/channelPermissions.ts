import type { ChannelRoleOverwrites, ChannelRolePermissions } from "../types";

export type TriState = "inherit" | "allow" | "deny";

/** One row of the hub's permission catalogue, as `GET /permissions` returns it. */
export interface PermissionCatalogueEntry {
  id: string;
  scope: "hub" | "hub_and_channel";
  group: string;
  /** The section it is shown under; absent on a hub without
   *  `permissions.categories`. */
  category?: string;
}

/** The hub's sections, in the order an admin reads them. */
const SECTION_ORDER = ["messages", "voice", "moderation", "members", "channels", "events", "hub", "integrations", "federation"];

/** One heading of the permission list and the ids under it. */
export interface PermissionSection {
  /** A known section name, a category this build has no name for, `other`
   *  for ids the catalogue does not list, or `all` on a hub that serves no
   *  categories. */
  key: string;
  ids: string[];
}

/** `ids` grouped by the catalogue's categories, known sections first in a
 *  fixed order. Nothing is dropped: a category this build does not know keeps
 *  a section of its own, an id the catalogue does not list goes to `other`,
 *  and a hub that serves no categories gets one section holding everything. */
export function permissionSections(ids: string[], catalogue: PermissionCatalogueEntry[]): PermissionSection[] {
  const byId = new Map(catalogue.map((e) => [e.id, e.category]));
  if (!catalogue.some((e) => e.category)) return ids.length ? [{ key: "all", ids }] : [];
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const key = byId.get(id) ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  const rank = (k: string) => {
    if (k === "other") return SECTION_ORDER.length + 1;
    const i = SECTION_ORDER.indexOf(k);
    return i === -1 ? SECTION_ORDER.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([key, ids]) => ({ key, ids }));
}

/** Ids that may be set as a channel overwrite, from the hub's own catalogue.
 *
 * The scope comes from the server because the server enforces it: a `hub` id
 * set here is refused with a 400, and offering it would be a checkbox that
 * looks like it worked and granted nothing. This file used to carry its own
 * list and its own English labels, and "which of these has a channel
 * dimension" lived in a comment — that is the drift the catalogue endpoint
 * exists to end.
 */
export function overwritableIds(catalogue: PermissionCatalogueEntry[]): string[] {
  return catalogue.filter((p) => p.scope === "hub_and_channel").map((p) => p.id);
}

export function deriveRowStates(
  role: ChannelRolePermissions,
  ids: string[],
): Record<string, TriState> {
  const rows: Record<string, TriState> = {};
  for (const id of ids) {
    if (role.overwrites.allow.includes(id)) rows[id] = "allow";
    else if (role.overwrites.deny.includes(id)) rows[id] = "deny";
    else rows[id] = "inherit";
  }
  return rows;
}

export function buildOverwritePayload(rows: Record<string, TriState>): ChannelRoleOverwrites {
  const allow: string[] = [];
  const deny: string[] = [];
  for (const [permission, state] of Object.entries(rows)) {
    if (state === "allow") allow.push(permission);
    else if (state === "deny") deny.push(permission);
  }
  return { allow, deny };
}
