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

  // Built-in roles have no Appearance tab at all.
  for (const name of ["everyone", "Owner"]) {
    const editor = await selectRole(page, name);
    await expect(editor.getByRole("tab", { name: "Appearance" })).toHaveCount(0);
  }

  // A custom role has one, with the colour swatches.
  const editor = await createRoleInEditor(page, uniqueName("Trim"));
  await expect(editor.locator(".color-swatch").first()).toBeVisible();

  await deleteSelectedRole(page);
});
