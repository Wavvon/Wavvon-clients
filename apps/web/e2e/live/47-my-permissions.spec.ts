import { test, expect } from "@playwright/test";
import { createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P47 — GET /channels/:id/my-permissions + manage_roles settings access.
// A manage_roles (non-admin) member now gets the channel-settings gear and
// lands directly on the Permissions tab; rename/appearance/delete stay
// admin-only. A plain member still has no gear at all.

test("manage_roles member reaches Permissions tab; rename/delete stay admin-only", async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("modtab");
  await createChannel(page, channel);

  const memberName = `Mod E2E ${Date.now()}`;
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    const me = await hubApi<{ public_key: string }>(member, "/me");

    // Before the role lands: a plain member gets no settings gear.
    const row = member.getByRole("button", { name: channel, exact: true });
    await row.hover();
    await expect(row.getByRole("button", { name: "Channel settings" })).toHaveCount(0);

    // Owner setup via REST: a manage_roles (NOT admin) role, assigned to the member.
    const role = await hubApi<{ id: string }>(page, "/roles", {
      method: "POST",
      body: { name: uniqueName("mods"), permissions: ["manage_roles"], priority: 1 },
    });
    await hubApi(page, `/users/${me.public_key}/roles/${role.id}`, { method: "PUT" });

    // The endpoint itself reports the new channel-scoped effective set.
    const channels = await hubApi<Array<{ id: string; name: string }>>(member, "/channels");
    const chanId = channels.find((c) => c.name === channel)!.id;
    const mine = await hubApi<{ permissions: string[]; is_admin: boolean }>(
      member,
      `/channels/${chanId}/my-permissions`,
    );
    expect(mine.is_admin).toBe(false);
    expect(mine.permissions).toContain("manage_roles");

    // Fresh load so meInfo picks up the new role, then the gear appears.
    await member.reload();
    await expectInHub(member);
    const rowAfter = member.getByRole("button", { name: channel, exact: true });
    await rowAfter.hover();
    await rowAfter.getByRole("button", { name: "Channel settings" }).click();

    const dialog = member.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Lands directly on the Permissions tab (role list visible)…
    await expect(dialog.getByRole("button", { name: "@everyone" })).toBeVisible();
    // …with no admin-only surfaces: no Settings tab, no delete button.
    await expect(dialog.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Delete (channel|category)/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
