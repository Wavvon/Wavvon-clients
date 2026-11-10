import { useCallback, useMemo } from "react";
import { activeHubSupports } from "@platform";
import type { MeInfo } from "@shared/types";
import type { useVoice } from "./useVoice";

/** Every client-side permission gate, derived from the member's own roles and
 *  (while in voice) the per-channel voice grants. Pure derivation — the hub
 *  re-checks everything, so this is UX-only. */
export function usePermissions(
  meInfo: MeInfo | null,
  myVoicePerms: ReturnType<typeof useVoice>["myVoicePerms"],
  voiceChannelId: string | null,
) {
  const isAdmin = useMemo(
    () => meInfo?.roles?.some((r) => r.id === "builtin-owner") ?? false,
    [meInfo],
  );

  // The owner short-circuit the hub itself applies (permissions.rs,
  // `UserPermissions::has`). `builtin-owner` carries no `role_permissions`
  // rows at all since the catalogue rebuild — the explicit rows it used to
  // hold beside the wildcard went with it — so a gate that only reads the
  // role list hides from the owner what the hub would happily let them do.
  const can = useCallback(
    (permission: string) =>
      isAdmin || (meInfo?.roles?.some((r) => r.permissions?.includes(permission)) ?? false),
    [isAdmin, meInfo],
  );

  const canManageRoles = useMemo(() => can("roles.manage"), [can]);

  // The channel-settings gear and every tab behind it. Wider than
  // `canManageRoles`: a member given only `channels.permissions` edits this
  // channel’s overwrites without touching the hub’s roles.
  const canEditChannelPermissions = useMemo(
    () => can("roles.manage") || can("channels.permissions"),
    [can],
  );

  // Gates the voice roster's "Move to channel…" entry (events.md §7.1). The
  // hub re-checks channel-scoped against the destination on every voice_move —
  // this is UX-only, same posture as the other client-side permission gates here.
  const canMoveMembers = useMemo(() => can("voice.move_members"), [can]);

  // Same permission the invite endpoints require (routes/invites.rs) — gates
  // the "Invite people" entry for non-admin members too.
  const canCreateInvites = useMemo(() => can("channels.manage"), [can]);

  // Same permission the poll-create endpoint requires (SEND_MESSAGES) —
  // gates the "Create poll" context-menu entry the same way the composer's
  // own "+" attach menu is implicitly gated (anyone who can post here).
  const canSendMessages = useMemo(() => can("messages.send"), [can]);

  const canInVoice = useCallback((perm: string) => {
    if (myVoicePerms && myVoicePerms.channel_id === voiceChannelId) {
      return myVoicePerms.is_owner || myVoicePerms.permissions.includes(perm);
    }
    return can(perm);
  }, [myVoicePerms, voiceChannelId, can]);
  const canUseSoundboard = useMemo(() => canInVoice("voice.soundboard.use"), [canInVoice]);
  // Separate grants only where the hub says so; elsewhere voice.join covers both.
  const mediaPerms = activeHubSupports("voice.media.permissions");
  const canScreenShare = !mediaPerms || canInVoice("voice.screen_share");
  const canUseCamera = !mediaPerms || canInVoice("voice.camera");

  const canManageSoundboard = useMemo(() => can("voice.soundboard.manage"), [can]);
  const canManageHubAlliances = useMemo(() => can("alliances.manage"), [can]);

  const myRoles = useMemo(() => meInfo?.roles ?? [], [meInfo]);

  // Highest priority among the viewer's own roles — the hub only lets you
  // assign/remove roles strictly below your own priority.
  const myMaxPriority = useMemo(
    () => myRoles.reduce((m, r) => Math.max(m, r.priority), 0),
    [myRoles],
  );

  return {
    isAdmin, can, canManageRoles, canEditChannelPermissions, canMoveMembers, canCreateInvites,
    canSendMessages, canUseSoundboard, canScreenShare, canUseCamera, canManageSoundboard,
    canManageHubAlliances, myRoles, myMaxPriority,
  };
}
