import { hubFetch } from "../http";
import type { RoleInfo } from "../../types";

export async function listRoles(): Promise<RoleInfo[]> {
  const r = await hubFetch("/roles");
  return r.json() as Promise<RoleInfo[]>;
}

export interface RoleCreateInput {
  name: string;
  permissions: string[];
  priority: number;
  display_separately?: boolean;
  color?: string | null;
  icon?: string | null;
  category_id?: string | null;
}

export async function createRole(input: RoleCreateInput): Promise<RoleInfo> {
  const r = await hubFetch("/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return r.json() as Promise<RoleInfo>;
}

export interface RoleUpdateInput {
  name?: string;
  permissions?: string[];
  priority?: number;
  display_separately?: boolean;
  // Explicit `null` clears the field; `undefined` (key omitted) leaves it untouched.
  color?: string | null;
  icon?: string | null;
  category_id?: string | null;
}

// Only keys actually present on `updates` (including explicit nulls) are sent —
// an absent key means "don't touch" to the server's tri-state PATCH handling.
export function buildRoleUpdateBody(updates: RoleUpdateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  (Object.keys(updates) as (keyof RoleUpdateInput)[]).forEach((key) => {
    if (updates[key] !== undefined) body[key] = updates[key];
  });
  return body;
}

export async function updateRole(roleId: string, updates: RoleUpdateInput): Promise<RoleInfo> {
  const r = await hubFetch(`/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(buildRoleUpdateBody(updates)),
  });
  return r.json() as Promise<RoleInfo>;
}

export async function deleteRole(roleId: string): Promise<void> {
  await hubFetch(`/roles/${roleId}`, { method: "DELETE" });
}
