import { test, expect, type Page } from "@playwright/test";
import { expectInHub, hubApi, uniqueName } from "./helpers/live";

// P4 — role categories + per-role color/icon (role-categories.md §4, §6):
// create a category, file a custom role under it, set a role color and a
// unicode icon, and confirm everything survives a reload.
//
// The role itself is created over REST: the web client has no role-creation
// UI yet (desktop parity item), and the hub rejects appearance updates on
// built-in roles ("Cannot modify built-in roles") even though the web UI
// offers the controls there — recorded as a finding in ROADMAP.

async function openRolesAdmin(page: Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
}

test("role category grouping, color, and icon persist", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);

  const role = uniqueName("raider");
  await hubApi(page, "/roles", {
    method: "POST",
    body: { name: role, permissions: ["send_messages"], priority: 5 },
  });

  await openRolesAdmin(page);

  // Create a category; it shows up as an (empty) group.
  const cat = uniqueName("teams");
  await page.getByPlaceholder("Category name").fill(cat);
  await page.getByRole("button", { name: "Add category" }).click();
  // hasText would also match other groups through their rows' category
  // <select> options — anchor on the group header instead.
  const group = page
    .locator(".role-category-group")
    .filter({ has: page.locator(".role-category-header", { hasText: cat }) });
  await expect(group).toBeVisible();
  await expect(group.getByText("No roles in this category yet.")).toBeVisible();

  // File the custom role under the new category via its row's select.
  const roleRow = page.locator(".settings-row").filter({ hasText: role });
  await roleRow.locator("select").selectOption({ label: cat });
  const movedRow = group.locator(".settings-row").filter({ hasText: role });
  await expect(movedRow).toBeVisible();

  // Set a role color from the swatch picker.
  await movedRow.getByTitle("Role color").click();
  await page.getByTitle("#e74c3c", { exact: true }).click();
  await expect(movedRow.getByTitle("Role color")).toHaveCSS(
    "background-color",
    "rgb(231, 76, 60)",
  );

  // Set a unicode icon via the emoji picker in the same row.
  await movedRow.getByRole("button", { name: "Add reaction" }).click();
  await page.locator(".reaction-picker-emoji", { hasText: "🎮" }).first().click();
  await expect(movedRow.getByText("🎮")).toBeVisible();

  // Persistence: reload and re-open the tab.
  await page.reload();
  await expectInHub(page);
  await openRolesAdmin(page);
  const groupAfter = page
    .locator(".role-category-group")
    .filter({ has: page.locator(".role-category-header", { hasText: cat }) });
  const rowAfter = groupAfter.locator(".settings-row").filter({ hasText: role });
  await expect(rowAfter).toBeVisible();
  await expect(rowAfter.getByTitle("Role color")).toHaveCSS(
    "background-color",
    "rgb(231, 76, 60)",
  );
  await expect(rowAfter.getByText("🎮")).toBeVisible();
});
