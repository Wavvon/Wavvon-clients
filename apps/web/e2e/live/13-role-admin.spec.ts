import { test, expect } from "@playwright/test";
import { expectInHub, hubApi, uniqueName, openRolesAdmin, createRoleInEditor, saveRole, deleteSelectedRole } from "./helpers/live";

// P13 — create / edit-permissions / delete a role from the web Roles admin.

type Role = { id: string; name: string; permissions: string[] };

test("create a role with a permission, edit its permissions, then delete it", async ({ page }) => {
  await page.goto("/");
  await expectInHub(page);
  await openRolesAdmin(page);

  const roleName = uniqueName("Mod");
  const editor = await createRoleInEditor(page, roleName);
  const findRole = async () =>
    (await hubApi<Role[]>(page, "/roles")).find((r) => r.name === roleName);
  await expect.poll(async () => (await findRole())?.id).toBeTruthy();

  // Permissions are switches labelled by name and a sentence; edits collect
  // in the save bar until Save.
  await editor.getByRole("tab", { name: "Permissions" }).click();
  await editor.getByRole("switch", { name: /^Kick members/ }).check();
  await saveRole(page);
  await expect.poll(async () => (await findRole())?.permissions).toContain("moderation.kick");

  await editor.getByRole("switch", { name: /^Ban members permanently/ }).check();
  await saveRole(page);
  await expect.poll(async () => (await findRole())?.permissions).toContain("moderation.ban.permanent");

  await deleteSelectedRole(page);
  await expect(page.locator(".roles-row-main", { hasText: roleName })).toHaveCount(0);
  await expect.poll(async () => await findRole()).toBeFalsy();
});
