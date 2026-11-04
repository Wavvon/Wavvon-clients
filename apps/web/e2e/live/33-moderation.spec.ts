import { test, expect, type Page } from "@playwright/test";
import { channelButton, createChannel, expectInHub, hubApi, newMemberPage, openSettingRow, settingRow, uniqueName } from "./helpers/live";

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

    // The hub only broadcasts MemberOffline for a ban, so the row used to stay
    // and a banned member looked merely offline.
    await expect(row).toHaveCount(0, { timeout: 10000 });
  } finally {
    await context.close();
  }
});

async function openAdminTab(page: Page, tab: string) {
  await page.locator(".hub-header-button").click();
  await page.getByRole("button", { name: "Hub settings" }).click();
  await page.getByRole("button", { name: tab, exact: true }).click();
}

// The admin Members tab swallowed every result: kick and ban ended in
// .catch(() => {}), mute and timeout in empty catches, and nothing on screen
// changed, so a moderator on the pilot kicked one member eleven times in two
// seconds (Wavvon-clients#164).
test("hub admin says what a mute and a kick did", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("Muted");
  const { context } = await newMemberPage(browser, memberName);
  try {
    await openAdminTab(page, "Members");
    const row = await openSettingRow(page, memberName);

    await row.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(page.getByText(`${memberName} is muted.`)).toBeVisible({ timeout: 10000 });
    await expect(row.locator(".setting-row-state")).toContainText("muted");
    await expect(row.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();

    await row.getByRole("button", { name: "Kick", exact: true }).click();
    await expect(page.getByText(`${memberName} was kicked.`)).toBeVisible({ timeout: 10000 });
    await expect(settingRow(page, memberName)).toHaveCount(0);
  } finally {
    await context.close();
  }
});
