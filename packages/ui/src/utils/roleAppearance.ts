import type { CSSProperties } from "react";
import type { RoleCategory, RoleInfo } from "../types";

// Canonical validator for hub-supplied role/category colors. Hubs are
// untrusted: a color value that reaches a `background`/style sink unvalidated
// lets a malicious hub smuggle a `url(...)` and beacon the viewer's IP/UA
// when the swatch renders. Only a plain 6-digit hex is ever safe there.
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function safeRoleColor(color: string | null | undefined): string | null {
  return typeof color === "string" && HEX_RE.test(color) ? color : null;
}

// @everyone and Owner are implicit, structural roles — every member carries
// @everyone, and Owner reads as authority beside the name rather than as a
// labelled tag. The profile card only lists a member's *distinguishing* roles,
// so these are filtered out there (otherwise they'd sit alone under an odd
// "Uncategorized" header). Admin role management still shows them — it edits them.
export const IMPLICIT_ROLE_IDS = ["builtin-owner", "builtin-everyone"];

export function distinguishingRoles(roles: RoleInfo[]): RoleInfo[] {
  return roles.filter((r) => !IMPLICIT_ROLE_IDS.includes(r.id));
}

export interface RoleCategoryGroup {
  category: RoleCategory | null;
  roles: RoleInfo[];
}

export interface GroupRolesOptions {
  // Admin management wants every category visible even before it holds any
  // roles; the profile card wants only the categories this user has roles in.
  includeEmptyCategories?: boolean;
}

export function groupRolesByCategory(
  roles: RoleInfo[],
  categories: RoleCategory[],
  options: GroupRolesOptions = {},
): RoleCategoryGroup[] {
  const orderedCategories = categories.slice().sort((a, b) => a.position - b.position);
  const byId = new Map(orderedCategories.map((c) => [c.id, c]));
  const bucketed = new Map<string, RoleInfo[]>();
  const uncategorized: RoleInfo[] = [];

  for (const role of roles) {
    if (role.category_id && byId.has(role.category_id)) {
      const bucket = bucketed.get(role.category_id);
      if (bucket) bucket.push(role);
      else bucketed.set(role.category_id, [role]);
    } else {
      uncategorized.push(role);
    }
  }

  const groups: RoleCategoryGroup[] = [];
  for (const category of orderedCategories) {
    const bucket = bucketed.get(category.id) ?? [];
    if (bucket.length > 0 || options.includeEmptyCategories) {
      groups.push({ category, roles: bucket });
    }
  }
  if (uncategorized.length > 0) {
    groups.push({ category: null, roles: uncategorized });
  }
  return groups;
}

// Exposes a role/category color as a CSS custom property so callers can tint
// borders and text via `color-mix()` against the theme's own foreground —
// blending with `var(--text)`/`var(--border)` rather than the raw hex keeps
// contrast readable in both light and dark themes.
export function roleTintStyle(color: string | null | undefined): CSSProperties | undefined {
  const safe = safeRoleColor(color);
  if (!safe) return undefined;
  return { "--role-color": safe } as CSSProperties;
}
