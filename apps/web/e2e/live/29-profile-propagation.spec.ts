import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P29 — live profile propagation. A member renames themselves; the owner sees
// the new name in the member list WITHOUT reloading. Previously PATCH /me
// broadcast no event, so other clients kept the stale name until reconnect.

test("a member's rename propagates live to other clients", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("prop");
  await createChannel(page, channel);
  await channelButton(page, channel).click();

  const initial = uniqueName("Before");
  const renamed = uniqueName("After");
  const { context, page: member } = await newMemberPage(browser, initial);
  try {
    await channelButton(member, channel).click();

    // Owner picks the new member up live (onMemberOnline refetch).
    await expect(
      page.locator("li.user-list-item", { hasText: initial }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Member renames via Settings → Profile. The default profile context is
    // local-only (P24) — editing the hub's own context is what actually
    // PATCHes /me and propagates live to the owner. Index 0 is the default
    // profile; index 1 is the (only) joined hub.
    await member.locator(".btn-icon-gear").first().click();
    await member.getByRole("button", { name: "Profile", exact: true }).first().click();
    await member.locator("#profile-context-select").selectOption({ index: 1 });
    const nameInput = member.locator("#profile-editor-name").first();
    await nameInput.fill(renamed);
    await member.getByRole("button", { name: "Save changes" }).first().click();

    // Owner sees the new name appear and the old one gone — live, no reload.
    await expect(
      page.locator("li.user-list-item", { hasText: renamed }).first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("li.user-list-item", { hasText: initial })).toHaveCount(0, {
      timeout: 10000,
    });
  } finally {
    await context.close();
  }
});
