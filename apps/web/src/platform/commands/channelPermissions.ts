import { hubFetch } from "../http";
import type {
  ChannelPermissionsResponse,
  ChannelRoleOverwrites,
  ChannelRolePermissions,
} from "@wavvon/ui";

export async function getChannelPermissions(channelId: string): Promise<ChannelPermissionsResponse> {
  const r = await hubFetch(`/channels/${channelId}/permissions`);
  return r.json() as Promise<ChannelPermissionsResponse>;
}

export interface MyChannelPermissions {
  channel_id: string;
  permissions: string[];
  is_owner: boolean;
}

/** The caller's own effective channel-scoped permissions — unlike
 * getChannelPermissions this needs no manage_roles, so plain members can
 * gate UI affordances (soundboard button, composer, settings gear) on it. */
export async function getMyChannelPermissions(channelId: string): Promise<MyChannelPermissions> {
  const r = await hubFetch(`/channels/${channelId}/my-permissions`);
  return r.json() as Promise<MyChannelPermissions>;
}

export async function setChannelRolePermissions(
  channelId: string,
  roleId: string,
  overwrites: ChannelRoleOverwrites,
): Promise<ChannelRolePermissions> {
  const r = await hubFetch(`/channels/${channelId}/permissions/${roleId}`, {
    method: "PUT",
    body: JSON.stringify(overwrites),
  });
  return r.json() as Promise<ChannelRolePermissions>;
}

export async function clearChannelRolePermissions(channelId: string, roleId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/permissions/${roleId}`, { method: "DELETE" });
}

export interface PermissionCatalogueEntry {
  id: string;
  /** `hub_and_channel` may also be set as a channel overwrite; `hub` may not,
   *  and the hub answers 400 for one that tries. */
  scope: "hub" | "hub_and_channel";
  /** Dotted prefix, so a screen groups without re-splitting the id. */
  group: string;
}

/** The permission catalogue this hub can express.
 *
 *  Gated on the `permissions.catalogue` capability by the caller: a hub
 *  without it has no such route, and its ids are the older snake_case set,
 *  which shares no spelling with these.
 */
export async function listPermissionCatalogue(): Promise<PermissionCatalogueEntry[]> {
  const r = await hubFetch("/permissions");
  const body = (await r.json()) as { permissions: PermissionCatalogueEntry[] };
  return body.permissions ?? [];
}
