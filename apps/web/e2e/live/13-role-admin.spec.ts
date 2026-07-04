import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName } from "./helpers/live";

// P13 — create / edit-permissions / delete a role from the web Roles admin
// tab (previously desktop-only; see docs/client-parity.md).

async function openRolesAdmin(page: import("@playwright/test").Page) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: "Roles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
}

type Role = { id: string; name: string; permissions: string[] };

test("create a role with a permission, edit its permissions, then delete it", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openRolesAdmin(page);

  const roleName = uniqueName("Mod");

  // Create: open the creator, name it, tick a permission, submit.
  await page.getByRole("button", { name: "New role" }).click();
  await page.getByRole("textbox", { name: "Role name" }).fill(roleName);
  await page.getByRole("checkbox", { name: "Kick members" }).check();
  await page.getByRole("button", { name: "Create role" }).click();

  // The role appears in the list, and the hub has it with the permission.
  const row = page.locator(".settings-row").filter({ hasText: roleName });
  await expect(row).toBeVisible({ timeout: 10000 });
  const findRole = async () =>
    (await hubApi<Role[]>(page, "/roles")).find((r) => r.name === roleName);
  await expect.poll(async () => (await findRole())?.permissions).toContain("kick_members");

  // Edit permissions: expand the role's Permissions and add one. This
  // checkbox is server-controlled (flips only after the PATCH round-trips),
  // so click and poll the API rather than using check()'s immediate assert.
  await row.getByRole("button", { name: /^Permissions/ }).click();
  await page.getByRole("checkbox", { name: "Ban members" }).click();
  await expect.poll(async () => (await findRole())?.permissions).toContain("ban_members");

  // Delete (native confirm → accept).
  page.on("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toBeHidden({ timeout: 10000 });
  await expect.poll(async () => await findRole()).toBeFalsy();
});
