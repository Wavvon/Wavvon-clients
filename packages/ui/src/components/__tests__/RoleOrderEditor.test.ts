import { describe, it, expect } from "vitest";
import type { RoleInfo } from "../../types";
import { movableRoles, reorderWithinGroup } from "../admin/RoleOrderEditor";

const role = (id: string, priority: number) => ({ id, name: id, priority, permissions: [] }) as unknown as RoleInfo;

describe("movableRoles", () => {
  it("offers only the roles below the caller, highest first, never a built-in", () => {
    const roles = [role("builtin-owner", 1000), role("admin", 100), role("low", 10), role("mid", 50), role("builtin-everyone", 0)];
    expect(movableRoles(roles, 100).map((r) => r.id)).toEqual(["mid", "low"]);
    expect(movableRoles(roles, 1000).map((r) => r.id)).toEqual(["admin", "mid", "low"]);
  });
});

describe("reorderWithinGroup", () => {
  it("permutes only the slots the group held", () => {
    expect(reorderWithinGroup(["a", "x", "b", "y", "c"], ["a", "b", "c"], "c", "a")).toEqual(["c", "x", "a", "y", "b"]);
  });
  it("returns null when nothing moves or an id is foreign", () => {
    expect(reorderWithinGroup(["a", "b"], ["a", "b"], "a", "a")).toBeNull();
    expect(reorderWithinGroup(["a", "b"], ["a"], "a", "b")).toBeNull();
  });
});
