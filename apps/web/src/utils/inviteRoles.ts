import type { RoleInfo } from "../types";

/** True if holding `role` alone grants the hub's admin permission — mirrors
 *  hub/src/routes/invites.rs::role_grants_admin. Used both to force
 *  single-use/short-expiry on admin-granting invites and to keep the hub's
 *  default invite role from ever being an admin role. */
export function roleGrantsAdmin(role: RoleInfo): boolean {
  return role.permissions.includes("admin");
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
