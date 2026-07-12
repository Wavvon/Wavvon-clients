import { test, expect } from "@playwright/test";
import { expectInHub, uniqueName } from "./helpers/live";

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

  // Built-in roles: no color swatch (the clearest appearance control).
  const everyone = page.locator(".settings-row").filter({ hasText: "everyone" }).first();
  await expect(everyone).toBeVisible({ timeout: 10000 });
  await expect(everyone.locator(".color-swatch")).toHaveCount(0);
  const owner = page.locator(".settings-row").filter({ hasText: "Owner" }).first();
  await expect(owner.locator(".color-swatch")).toHaveCount(0);

  // A custom role keeps the swatch.
  const roleName = uniqueName("Trim");
  await page.getByRole("button", { name: "New role" }).click();
  await page.getByRole("textbox", { name: "Role name" }).fill(roleName);
  await page.getByRole("button", { name: "Create role" }).click();

  const custom = page.locator(".settings-row").filter({ hasText: roleName }).first();
  await expect(custom).toBeVisible({ timeout: 10000 });
  await expect(custom.locator(".color-swatch").first()).toBeVisible();

  // Cleanup so re-runs against the persistent DB stay clean.
  page.on("dialog", (d) => d.accept());
  await custom.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(custom).toBeHidden({ timeout: 10000 });
});
