import type { ChannelRoleOverwrites, ChannelRolePermissions } from "../types";

export type TriState = "inherit" | "allow" | "deny";

// Permissions eligible for a per-channel role overwrite. Excludes "admin"
// (overwrite-immune server-side — see nested-channels-ux.md §3.2) and
// hub-only permissions like manage_bots that have no channel dimension.
export const CHANNEL_OVERWRITE_PERMISSIONS: { id: string; label: string }[] = [
  { id: "read_messages", label: "Read messages" },
  { id: "send_messages", label: "Send messages" },
  { id: "manage_channels", label: "Manage channels" },
  { id: "manage_messages", label: "Manage messages" },
  { id: "manage_roles", label: "Manage roles" },
  { id: "kick_members", label: "Kick members" },
  { id: "ban_members", label: "Ban members" },
  { id: "mute_members", label: "Mute members" },
  { id: "timeout_members", label: "Timeout members" },
  { id: "manage_games", label: "Manage games" },
  { id: "manage_hub_icons", label: "Manage hub icon library" },
  { id: "manage_channel_icons", label: "Set icons and colors on channels" },
  { id: "create_posts", label: "Create forum posts" },
  { id: "manage_posts", label: "Manage forum posts" },
  { id: "start_game", label: "Start games" },
  { id: "create_events", label: "Create events" },
  { id: "use_soundboard", label: "Use soundboard" },
  { id: "move_members", label: "Move members between voice channels" },
];

export function deriveRowStates(role: ChannelRolePermissions): Record<string, TriState> {
  const rows: Record<string, TriState> = {};
  for (const perm of CHANNEL_OVERWRITE_PERMISSIONS) {
    if (role.overwrites.allow.includes(perm.id)) rows[perm.id] = "allow";
    else if (role.overwrites.deny.includes(perm.id)) rows[perm.id] = "deny";
    else rows[perm.id] = "inherit";
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
