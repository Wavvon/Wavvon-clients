import { describe, it, expect } from "vitest";
import { buildRoleUpdateBody } from "../commands/roles";
import { buildRoleCategoryUpdateBody } from "../commands/roleCategories";

describe("buildRoleUpdateBody", () => {
  it("omits fields that are absent from the input", () => {
    const body = buildRoleUpdateBody({ name: "Moderator" });
    expect(body).toEqual({ name: "Moderator" });
  });

  it("keeps explicit nulls so the server can clear color/icon/category", () => {
    const body = buildRoleUpdateBody({ color: null, icon: null, category_id: null });
    expect(body).toEqual({ color: null, icon: null, category_id: null });
  });

  it("mixes set and cleared fields in the same request", () => {
    const body = buildRoleUpdateBody({ color: "#4a8d7a", icon: null });
    expect(body).toEqual({ color: "#4a8d7a", icon: null });
  });

  it("produces an empty body for a no-op update", () => {
    expect(buildRoleUpdateBody({})).toEqual({});
  });
});

describe("buildRoleCategoryUpdateBody", () => {
  it("omits fields that are absent from the input", () => {
    const body = buildRoleCategoryUpdateBody({ position: 2 });
    expect(body).toEqual({ position: 2 });
  });

  it("keeps explicit nulls so the server can clear color/icon", () => {
    const body = buildRoleCategoryUpdateBody({ color: null, icon: null });
    expect(body).toEqual({ color: null, icon: null });
  });
});
