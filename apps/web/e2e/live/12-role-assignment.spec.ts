import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P12 — assign / remove a role to ANOTHER user.
//
// Finding: the web client has NO UI for this. The Hub Admin "Members" tab
// shows each member's roles read-only (only Kick/Ban actions), and the
// member right-click menu has only Send DM / Copy key / Mute / Kick / Ban.
// There is also no create/delete-role UI. These flows are desktop-only.
//
// So this spec (1) proves the hub endpoints work end-to-end via the API
// (a regression guard for when the web UI is built), and (2) documents the
// missing UI so the gap is visible and the tripwire fires once it lands.

type Role = { id: string; name: string };

test("hub role assign/remove endpoints work (backend)", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("RoleTarget");
  const { context } = await newMemberPage(browser, memberName);
  try {
    // Resolve the member's pubkey from the owner's /users view.
    const users = await hubApi<Array<{ public_key: string; display_name: string | null }>>(page, "/users");
    const target = users.find((u) => u.display_name === memberName);
    expect(target, "member should appear in /users").toBeTruthy();
    const pk = target!.public_key;

    // Create a role and assign it to the member.
    const role = await hubApi<Role>(page, "/roles", {
      method: "POST",
      body: { name: uniqueName("VIP"), permissions: ["send_messages"], priority: 3 },
    });
    await hubApi(page, `/users/${pk}/roles/${role.id}`, { method: "PUT" });
    let roles = await hubApi<Role[]>(page, `/users/${pk}/roles`);
    expect(roles.some((r) => r.id === role.id), "role assigned").toBe(true);

    // Remove it.
    await hubApi(page, `/users/${pk}/roles/${role.id}`, { method: "DELETE" });
    roles = await hubApi<Role[]>(page, `/users/${pk}/roles`);
    expect(roles.some((r) => r.id === role.id), "role removed").toBe(false);
  } finally {
    await context.close();
  }
});

test("web UI exposes no role-assignment control (documented gap)", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("rolegap");
  await createChannel(page, channel);
  await channelButton(page, channel).click();

  const memberName = uniqueName("Plain");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, channel).click();

    // (a) Admin Members tab: member row has Kick/Ban but no role control.
    await page.reload();
    await expectInHub(page);
    await page.locator(".hub-header-button").click();
    await page.getByRole("button", { name: "Hub settings" }).click();
    await page.getByRole("button", { name: "Members", exact: true }).click();
    const row = page.locator("table.members-table tr", { hasText: memberName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole("button", { name: "Kick" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Ban" })).toBeVisible();
    // No role editor in the row: no <select>, no add-role button.
    await expect(row.locator("select")).toHaveCount(0);
    await expect(row.getByRole("button", { name: /role/i })).toHaveCount(0);
    // Close admin.
    await page.getByRole("button", { name: "Close" }).first().click().catch(() => {});
    await page.keyboard.press("Escape");

    // (b) Member right-click menu: moderation actions only, no role option.
    await channelButton(page, channel).click();
    const memberRow = page.locator("li.user-list-item", { hasText: memberName });
    await expect(memberRow).toBeVisible({ timeout: 10000 });
    await memberRow.click({ button: "right" });
    const menu = page.locator(".context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Kick" })).toBeVisible();
    await expect(menu.getByRole("button", { name: /role/i })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
