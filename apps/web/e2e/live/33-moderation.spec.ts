import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, uniqueName } from "./helpers/live";

// P33 — ban a member from the right-click menu. The client used to POST to
// /admin/bans (and DELETE /admin/members/... for kick, /admin/members/../mute
// for mute) — none of which exist; the real routes are /moderation/{bans,kick,
// mutes}. So moderation from the member menu silently errored.

test("owner bans a member via the right-click menu", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("mod");
  await createChannel(page, channel);
  await channelButton(page, channel).click();

  const memberName = uniqueName("Target");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, channel).click();

    // The member shows up in the owner's member list.
    const row = page.locator("li.user-list-item", { hasText: memberName }).first();
    await expect(row).toBeVisible({ timeout: 15000 });

    // Right-click → context menu → Ban (accept the confirm()).
    page.on("dialog", (d) => d.accept());
    await row.click({ button: "right" });
    await page.getByRole("button", { name: "Ban", exact: true }).click();

    // The ban landed server-side (previously the wrong endpoint 404/405'd).
    await expect
      .poll(async () => (await hubApi<unknown[]>(page, "/moderation/bans")).length, { timeout: 10000 })
      .toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
