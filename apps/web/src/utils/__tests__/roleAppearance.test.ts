import { describe, it, expect } from "vitest";
import type { RoleCategory, RoleInfo } from "../../types";
import { groupRolesByCategory, roleTintStyle, safeRoleColor } from "../roleAppearance";

function makeRole(overrides: Partial<RoleInfo> = {}): RoleInfo {
  return {
    id: "role-1",
    name: "Role",
    permissions: [],
    priority: 0,
    color: null,
    icon: null,
    category_id: null,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<RoleCategory> = {}): RoleCategory {
  return {
    id: "cat-1",
    name: "Category",
    color: null,
    icon: null,
    position: 0,
    created_at: 0,
    ...overrides,
  };
}

describe("groupRolesByCategory", () => {
  it("groups roles under their category, ordered by category position", () => {
    const staff = makeCategory({ id: "staff", name: "Staff", position: 1 });
    const games = makeCategory({ id: "games", name: "Games", position: 0 });
    const roles = [
      makeRole({ id: "mod", name: "Moderator", category_id: "staff" }),
      makeRole({ id: "gamer", name: "Gamer", category_id: "games" }),
    ];

    const groups = groupRolesByCategory(roles, [staff, games]);

    expect(groups.map((g) => g.category?.id)).toEqual(["games", "staff"]);
    expect(groups[0].roles.map((r) => r.id)).toEqual(["gamer"]);
    expect(groups[1].roles.map((r) => r.id)).toEqual(["mod"]);
  });

  it("puts uncategorized roles in a trailing group with a null category", () => {
    const staff = makeCategory({ id: "staff", position: 0 });
    const roles = [
      makeRole({ id: "mod", category_id: "staff" }),
      makeRole({ id: "member", category_id: null }),
    ];

    const groups = groupRolesByCategory(roles, [staff]);

    expect(groups).toHaveLength(2);
    expect(groups[groups.length - 1].category).toBeNull();
    expect(groups[groups.length - 1].roles.map((r) => r.id)).toEqual(["member"]);
  });

  it("treats a category_id with no matching category as uncategorized", () => {
    const roles = [makeRole({ id: "orphan", category_id: "deleted-category" })];

    const groups = groupRolesByCategory(roles, []);

    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBeNull();
  });

  it("omits empty categories by default", () => {
    const empty = makeCategory({ id: "empty" });
    const groups = groupRolesByCategory([], [empty]);
    expect(groups).toHaveLength(0);
  });

  it("includes empty categories when includeEmptyCategories is set", () => {
    const empty = makeCategory({ id: "empty" });
    const groups = groupRolesByCategory([], [empty], { includeEmptyCategories: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].roles).toEqual([]);
  });

  it("omits the uncategorized group entirely when every role has a category", () => {
    const staff = makeCategory({ id: "staff" });
    const roles = [makeRole({ category_id: "staff" })];
    const groups = groupRolesByCategory(roles, [staff]);
    expect(groups.some((g) => g.category === null)).toBe(false);
  });
});

describe("roleTintStyle", () => {
  it("returns undefined for no color", () => {
    expect(roleTintStyle(null)).toBeUndefined();
    expect(roleTintStyle(undefined)).toBeUndefined();
  });

  it("exposes the color as a --role-color custom property", () => {
    expect(roleTintStyle("#4a8d7a")).toEqual({ "--role-color": "#4a8d7a" });
  });

  it("drops a malicious non-hex color rather than exposing it", () => {
    expect(roleTintStyle("url(https://attacker.example/beacon)")).toBeUndefined();
  });
});

describe("safeRoleColor", () => {
  it("accepts a well-formed 6-digit hex color", () => {
    expect(safeRoleColor("#aabbcc")).toBe("#aabbcc");
  });

  it("rejects a CSS url() smuggled as a color", () => {
    expect(safeRoleColor("url(https://attacker.example/beacon)")).toBeNull();
  });

  it("rejects named colors", () => {
    expect(safeRoleColor("red")).toBeNull();
  });

  it("rejects a 3-digit hex shorthand", () => {
    expect(safeRoleColor("#fff")).toBeNull();
  });

  it("rejects hex with alpha channel", () => {
    expect(safeRoleColor("#aabbccdd")).toBeNull();
  });

  it("rejects a hex value with trailing injected content", () => {
    expect(safeRoleColor("#aabbcc; x")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(safeRoleColor("")).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(safeRoleColor(null)).toBeNull();
    expect(safeRoleColor(undefined)).toBeNull();
  });
});
