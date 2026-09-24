import { invoke } from "@tauri-apps/api/core";
import type { RoleInfo } from "../types";
import type {
  ChannelPermissionsTabActions,
  ChannelBansTabActions,
  ChannelTalkPowerTabActions,
  ChannelPermissionsResponse,
  ChannelRoleOverwrites,
  ChannelRolePermissions,
  PermissionCatalogueEntry,
} from "@wavvon/ui";

// Pure invoke wrappers for ChannelSettingsModal's permissions/bans/talk-power
// tabs — no App state involved, so these are stable module-level consts
// rather than something recreated per render inside useChannelCrud.
export const channelPermissionsTabActions: ChannelPermissionsTabActions = {
  getChannelPermissions: (channelId) => invoke<ChannelPermissionsResponse>("get_channel_permissions", { channelId }),
  setChannelRolePermissions: (channelId, roleId, overwrites: ChannelRoleOverwrites) =>
    invoke<ChannelRolePermissions>("set_channel_role_permissions", {
      channelId,
      roleId,
      allow: overwrites.allow,
      deny: overwrites.deny,
    }),
  clearChannelRolePermissions: (channelId, roleId) =>
    invoke("clear_channel_role_permissions", { channelId, roleId }),
  listRoles: () => invoke<RoleInfo[]>("list_roles"),
  // Without this the tab renders no rows at all: every overwrite id comes from
  // the hub's catalogue. The command answers an empty list for a hub too old
  // to serve one, which is the same reading the web wrapper's capability check
  // produces.
  listPermissionCatalogue: () => invoke<PermissionCatalogueEntry[]>("list_permission_catalogue"),
};

export const channelBansTabActions: ChannelBansTabActions = {
  listChannelBans: (channelId) =>
    invoke<{ pubkey: string; reason: string | null }[]>("list_channel_bans", { channelId }),
  banFromChannel: (channelId, pubkey, reason) =>
    invoke("channel_ban_user", { channelId, targetPublicKey: pubkey, reason: reason ?? null }),
  unbanFromChannel: (channelId, pubkey) =>
    invoke("channel_unban_user", { channelId, targetPublicKey: pubkey }),
};

export const channelTalkPowerTabActions: ChannelTalkPowerTabActions = {
  getTalkPower: (channelId) =>
    invoke<{ min_talk_power: number }>("get_talk_power", { channelId }).then((r) => r.min_talk_power),
  setTalkPower: (channelId, minTalkPower) =>
    invoke("set_talk_power_cmd", { channelId, minTalkPower }),
};
