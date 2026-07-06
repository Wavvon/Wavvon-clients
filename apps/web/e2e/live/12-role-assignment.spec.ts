import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P12 — assign / remove a role to another user from the web right-click
// menu (parity with desktop; see docs/client-parity.md). The Roles section
// of the member context menu toggles PUT/DELETE /users/{pk}/roles/{id}.

type Role = { id: string; name: string };

test("hub role assign/remove endpoints work (backend)", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("RoleTarget");
  const { context } = await newMemberPage(browser, memberName);
  try {
    const users = await hubApi<Array<{ public_key: string; display_name: string | null }>>(page, "/users");
    const target = users.find((u) => u.display_name === memberName);
    expect(target, "member should appear in /users").toBeTruthy();
    const pk = target!.public_key;

    const role = await hubApi<Role>(page, "/roles", {
      method: "POST",
      body: { name: uniqueName("VIP"), permissions: ["send_messages"], priority: 3 },
    });
    await hubApi(page, `/users/${pk}/roles/${role.id}`, { method: "PUT" });
    let roles = await hubApi<Role[]>(page, `/users/${pk}/roles`);
    expect(roles.some((r) => r.id === role.id), "role assigned").toBe(true);

    await hubApi(page, `/users/${pk}/roles/${role.id}`, { method: "DELETE" });
    roles = await hubApi<Role[]>(page, `/users/${pk}/roles`);
    expect(roles.some((r) => r.id === role.id), "role removed").toBe(false);
  } finally {
    await context.close();
  }
});

test("assign and remove a role via the member right-click menu", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("rolemenu");
  await createChannel(page, channel);
  await channelButton(page, channel).click();

  // A custom, assignable role (no create-role UI on web yet — API setup).
  const roleName = uniqueName("Raider");
  await hubApi(page, "/roles", {
    method: "POST",
    body: { name: roleName, permissions: ["send_messages"], priority: 3 },
  });

  const memberName = uniqueName("Grantee");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, channel).click();

    // Owner reloads to pick up the new member, then opens the channel.
    await page.reload();
    await expectInHub(page);
    await channelButton(page, channel).click();

    const memberRow = page.locator("li.user-list-item", { hasText: memberName });
    await expect(memberRow).toBeVisible({ timeout: 10000 });
    await memberRow.click({ button: "right" });

    const menu = page.locator(".context-menu");
    await expect(menu.getByText("Roles", { exact: true })).toBeVisible();
    const roleToggle = menu.getByRole("menuitemcheckbox", { name: roleName });
    await expect(roleToggle).toBeVisible();
    await expect(roleToggle).toHaveAttribute("aria-checked", "false");

    // Assign: the toggle checks, and the hub reflects it.
    await roleToggle.click();
    await expect(roleToggle).toHaveAttribute("aria-checked", "true");
    const pk = (await hubApi<Array<{ public_key: string; display_name: string | null }>>(page, "/users"))
      .find((u) => u.display_name === memberName)!.public_key;
    let roles = await hubApi<Role[]>(page, `/users/${pk}/roles`);
    expect(roles.some((r) => r.name === roleName), "assigned via UI").toBe(true);

    // Remove: the toggle unchecks, and the hub reflects it.
    await roleToggle.click();
    await expect(roleToggle).toHaveAttribute("aria-checked", "false");
    roles = await hubApi<Role[]>(page, `/users/${pk}/roles`);
    expect(roles.some((r) => r.name === roleName), "removed via UI").toBe(false);
  } finally {
    await context.close();
  }
});
