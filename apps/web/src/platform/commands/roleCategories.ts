import { hubFetch } from "../http";
import type { RoleCategory } from "../../types";

export async function listRoleCategories(): Promise<RoleCategory[]> {
  const r = await hubFetch("/role-categories");
  return r.json() as Promise<RoleCategory[]>;
}

export interface RoleCategoryCreateInput {
  name: string;
  color?: string | null;
  icon?: string | null;
  position?: number;
}

export async function createRoleCategory(input: RoleCategoryCreateInput): Promise<RoleCategory> {
  const r = await hubFetch("/role-categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return r.json() as Promise<RoleCategory>;
}

export interface RoleCategoryUpdateInput {
  name?: string;
  // Explicit `null` clears the field; `undefined` (key omitted) leaves it untouched.
  color?: string | null;
  icon?: string | null;
  position?: number;
}

// Only keys actually present on `updates` (including explicit nulls) are sent —
// an absent key means "don't touch" to the server's tri-state PATCH handling.
export function buildRoleCategoryUpdateBody(updates: RoleCategoryUpdateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  (Object.keys(updates) as (keyof RoleCategoryUpdateInput)[]).forEach((key) => {
    if (updates[key] !== undefined) body[key] = updates[key];
  });
  return body;
}

export async function updateRoleCategory(id: string, updates: RoleCategoryUpdateInput): Promise<RoleCategory> {
  const r = await hubFetch(`/role-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(buildRoleCategoryUpdateBody(updates)),
  });
  return r.json() as Promise<RoleCategory>;
}

export async function deleteRoleCategory(id: string): Promise<void> {
  await hubFetch(`/role-categories/${id}`, { method: "DELETE" });
}
