import type { CSSProperties } from "react";
import type { RoleCategory, RoleInfo } from "../types";

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
  if (!color) return undefined;
  return { "--role-color": color } as CSSProperties;
}
