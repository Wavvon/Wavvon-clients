import type { ChannelRoleOverwrites, ChannelRolePermissions } from "../types";

export type TriState = "inherit" | "allow" | "deny";

/** One row of the hub's permission catalogue, as `GET /permissions` returns it. */
export interface PermissionCatalogueEntry {
  id: string;
  scope: "hub" | "hub_and_channel";
  group: string;
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
