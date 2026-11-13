import { describe, it, expect } from "vitest";
import type { RoleInfo } from "@wavvon/core";
import { roleGrantsAdmin, defaultInviteRoleOptions } from "../inviteRoles";

const role = (id: string, permissions: string[], priority = 10): RoleInfo =>
  ({ id, name: id, permissions, priority, color: null, icon: null, category_id: null });

describe("roleGrantsAdmin", () => {
  it("matches the hub's takeover rule: the owner role or roles.manage", () => {
    expect(roleGrantsAdmin(role("builtin-owner", []))).toBe(true);
    expect(roleGrantsAdmin(role("admin", ["roles.manage", "messages.manage"]))).toBe(true);
    expect(roleGrantsAdmin(role("mod", ["messages.manage"]))).toBe(false);
  });

  it("keeps a role-management role out of the default invite role options", () => {
    const options = defaultInviteRoleOptions([role("admin", ["roles.manage"]), role("member", [])]);
    expect(options.map((r) => r.id)).toEqual(["member"]);
  });
});
