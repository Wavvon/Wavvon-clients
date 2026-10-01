import { test, expect } from "@playwright/test";
import { expectInHub, uniqueName, confirmInApp, openSettingRow } from "./helpers/live";

// P31 — appearance controls (color / icon / category) are hidden for built-in
// roles. The hub rejects appearance PATCHes on @everyone/Owner
// (require_not_builtin), so showing the controls only produced a silent error.
// Custom roles keep them.

async function openRolesAdmin(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
}

test("built-in roles hide appearance controls; custom roles keep them", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openRolesAdmin(page);

  // Built-in roles: no color swatch (the clearest appearance control). The
  // controls are part of the form a role row opens to, so a closed row proves
  // nothing — each row has to be opened to be asked. The list is an accordion,
  // so each open closes the one before it; assert before moving on.
  const everyone = await openSettingRow(page, "everyone");
  await expect(everyone.locator(".color-swatch")).toHaveCount(0);
  const owner = await openSettingRow(page, "Owner");
  await expect(owner.locator(".color-swatch")).toHaveCount(0);

  // A custom role keeps the swatch.
  const roleName = uniqueName("Trim");
  const creator = await openSettingRow(page, "New role");
  await creator.getByRole("textbox", { name: "Role name" }).fill(roleName);
  await creator.getByRole("button", { name: "Create role" }).click();

  const custom = await openSettingRow(page, roleName);
  await expect(custom.locator(".color-swatch").first()).toBeVisible();

  // Cleanup so re-runs against the persistent DB stay clean.
  await custom.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmInApp(page);
  await expect(custom).toBeHidden({ timeout: 10000 });
});
