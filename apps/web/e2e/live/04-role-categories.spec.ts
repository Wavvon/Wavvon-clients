import { test, expect, type Page } from "@playwright/test";
import { expectInHub, hubApi, uniqueName, openRolesAdmin, selectRole, saveRole } from "./helpers/live";

// P4 — role categories + per-role color/icon (role-categories.md §4, §6):
// create a category, file a custom role under it, set a role color and a
// unicode icon, and confirm everything survives a reload.

const groupOf = (page: Page, cat: string) =>
  page
    .locator(".roles-list-pane .role-category-group")
    .filter({ has: page.locator(".role-category-header", { hasText: cat }) });

test("role category grouping, color, and icon persist", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const role = uniqueName("raider");
  await hubApi(page, "/roles", {
    method: "POST",
    body: { name: role, permissions: ["messages.send"], priority: 5 },
  });

  await openRolesAdmin(page);

  // Categories live in their own dialog.
  const cat = uniqueName("teams");
  await page.getByRole("button", { name: "Manage categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage categories" });
  await dialog.getByPlaceholder("New category name").fill(cat);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: `Rename ${cat}` })).toHaveValue(cat);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  // File the role under it, colour it and give it an icon, in one save.
  const editor = await selectRole(page, role);
  await editor.getByRole("tab", { name: "Appearance" }).click();
  await editor.getByRole("combobox", { name: "Category" }).selectOption({ label: cat });
  await editor.getByTitle("#e74c3c", { exact: true }).click();
  await editor.getByRole("button", { name: "Add reaction" }).click();
  await page.locator(".reaction-picker-emoji", { hasText: "🎮" }).first().click();
  await saveRole(page);

  const row = groupOf(page, cat).locator(".roles-row", { hasText: role });
  await expect(row).toBeVisible();
  await expect(row.locator(".roles-dot")).toHaveCSS("background-color", "rgb(231, 76, 60)");

  // Persistence: reload and re-open.
  await page.reload();
  await expectInHub(page);
  await openRolesAdmin(page);
  await expect(groupOf(page, cat).locator(".roles-row", { hasText: role })).toBeVisible();
  const after = await selectRole(page, role);
  await after.getByRole("tab", { name: "Appearance" }).click();
  await expect(after.locator(".roles-preview")).toContainText("🎮");
  await expect(after.getByTitle("#e74c3c", { exact: true })).toHaveClass(/\bselected\b/);
});
