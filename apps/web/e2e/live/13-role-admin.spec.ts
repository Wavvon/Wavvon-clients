import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName, confirmInApp, openSettingRow } from "./helpers/live";

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
  await openSettingRow(page, "New role");
  await page.getByRole("textbox", { name: "Role name" }).fill(roleName);
  await page.getByRole("checkbox", { name: "Kick members" }).check();
  await page.getByRole("button", { name: "Create role" }).click();

  // The role appears in the list, and the hub has it with the permission.
  // Every role is a settings row now: its permissions and its Delete live in
  // the form the row opens to, and the roles list is an accordion, so opening
  // this one closes the creator above it.
  const row = await openSettingRow(page, roleName);
  const findRole = async () =>
    (await hubApi<Role[]>(page, "/roles")).find((r) => r.name === roleName);
  await expect.poll(async () => (await findRole())?.permissions).toContain("moderation.kick");

  // Edit permissions: the open row lists them. This checkbox is
  // server-controlled (flips only after the PATCH round-trips), so click and
  // poll the API rather than using check()'s immediate assert.
  await row.getByRole("checkbox", { name: "Ban members permanently" }).click();
  await expect.poll(async () => (await findRole())?.permissions).toContain("moderation.ban.permanent");

  // Delete, going through the app's own confirmation.
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmInApp(page);
  await expect(row).toBeHidden({ timeout: 10000 });
  await expect.poll(async () => await findRole()).toBeFalsy();
});
