import { test, expect } from "@playwright/test";
import { expectInHub, uniqueName, openRolesAdmin, selectRole, createRoleInEditor, deleteSelectedRole } from "./helpers/live";

// P31 — appearance controls (color / icon / category) are hidden for built-in
// roles. The hub rejects appearance PATCHes on @everyone/Owner
// (require_not_builtin), so showing the controls only produced a silent error.
// Custom roles keep them.

test("built-in roles hide appearance controls; custom roles keep them", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openRolesAdmin(page);

  // everyone has no Appearance tab; the owner role is not listed at all.
  const everyone = await selectRole(page, "everyone");
  await expect(everyone.getByRole("tab", { name: "Appearance" })).toHaveCount(0);
  await expect(page.locator(".roles-row-main", { hasText: /^Owner$/ })).toHaveCount(0);

  // A custom role has one, with the colour swatches.
  const editor = await createRoleInEditor(page, uniqueName("Trim"));
  await expect(editor.locator(".color-swatch").first()).toBeVisible();

  await deleteSelectedRole(page);
});
