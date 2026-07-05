import { hubFetch } from "../http";
import type {
  ChannelPermissionsResponse,
  ChannelRoleOverwrites,
  ChannelRolePermissions,
} from "../../types";

export async function getChannelPermissions(channelId: string): Promise<ChannelPermissionsResponse> {
  const r = await hubFetch(`/channels/${channelId}/permissions`);
  return r.json() as Promise<ChannelPermissionsResponse>;
}

export interface MyChannelPermissions {
  channel_id: string;
  permissions: string[];
  is_admin: boolean;
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
