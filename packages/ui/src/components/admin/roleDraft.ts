import type { RoleInfo } from "../../types";

/** Unsaved edits to one role. Absent keys are untouched. */
export interface RoleDraft {
  name?: string;
  permissions?: string[];
  color?: string | null;
  icon?: string | null;
  category_id?: string | null;
  display_separately?: boolean;
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/** The draft reduced to fields that actually differ from the saved role. */
export function effectiveDraft(role: RoleInfo, draft: RoleDraft | undefined): RoleDraft {
  const out: RoleDraft = {};
  if (!draft) return out;
  if (draft.name !== undefined && draft.name.trim() !== role.name) out.name = draft.name.trim();
  if (draft.color !== undefined && !same(draft.color, role.color)) out.color = draft.color;
  if (draft.icon !== undefined && !same(draft.icon, role.icon)) out.icon = draft.icon;
  if (draft.category_id !== undefined && !same(draft.category_id, role.category_id)) out.category_id = draft.category_id;
  if (draft.display_separately !== undefined && draft.display_separately !== !!role.display_separately) {
    out.display_separately = draft.display_separately;
  }
  if (draft.permissions && changedPermissions(role.permissions, draft.permissions) > 0) out.permissions = draft.permissions;
  return out;
}

export function changedPermissions(saved: string[], next: string[]): number {
  return saved.filter((p) => !next.includes(p)).length + next.filter((p) => !saved.includes(p)).length;
}

/** What the bar counts: one per changed field, one per toggled permission. */
export function draftChangeCount(role: RoleInfo, draft: RoleDraft | undefined): number {
  const eff = effectiveDraft(role, draft);
  const { permissions, ...rest } = eff;
  return Object.keys(rest).length + (permissions ? changedPermissions(role.permissions, permissions) : 0);
}
