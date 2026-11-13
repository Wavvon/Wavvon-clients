import type { RoleInfo } from "@wavvon/core";

// One copy of the three invite-role filters. They existed as a file in the
// web app that nothing imported, while being hand-copied into InviteManager
// and QuickInviteModal — the right file existed and nobody used it
// (Wavvon-clients#61). Every one of them mirrors a server-side rule, so
// three copies meant three places to miss when the hub changes one.


/** True if a code granting `role` could take the hub over: the owner role,
 *  or any role carrying `roles.manage` — mirrors
 *  hub/src/routes/invites.rs::role_is_a_takeover_token. The hub forces such an
 *  invite to one use and a 24-hour expiry, and refuses it as the default
 *  invite role; checking only the owner role let the form promise an admin
 *  invite the hub then silently capped. */
export function roleGrantsAdmin(role: RoleInfo): boolean {
  return role.id === "builtin-owner" || role.permissions.includes("roles.manage");
}

/** Roles a user with `myMaxPriority` may grant via invite — mirrors the
 *  server-side priority guard (routes/invites.rs::create_invite): only
 *  strictly-lower-priority roles are grantable, and @everyone is implicit
 *  so it's excluded. Purely a UX filter; the server remains authoritative. */
export function grantableRoles(roles: RoleInfo[], myMaxPriority: number): RoleInfo[] {
  return roles
    .filter((r) => r.id !== "builtin-everyone" && r.priority < myMaxPriority)
    .sort((a, b) => b.priority - a.priority);
}

/** Roles eligible to be the hub's default invite role: any role other than
 *  the implicit @everyone that doesn't itself carry the admin permission
 *  (the hub validates the same constraint server-side). */
export function defaultInviteRoleOptions(roles: RoleInfo[]): RoleInfo[] {
  return roles
    .filter((r) => r.id !== "builtin-everyone" && !roleGrantsAdmin(r))
    .sort((a, b) => b.priority - a.priority);
}
