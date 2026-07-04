import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P10 — member list refresh + presence. The web client has no
// online/away/DND/custom status picker (presence is a binary online dot
// driven by member_online/member_offline WS events), so this covers what
// exists: a named member showing up online, then flipping to offline live
// when they disconnect.
//
// Known gap (documented, not asserted): a brand-new member does NOT appear
// in an already-loaded client's list until that client refetches /users
// (onMemberOnline only flips `online` on users already in the array), so
// the owner reloads once to pick the new member up.

test("a member shows online, then flips offline live when they leave", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const channel = uniqueName("presence");
  await createChannel(page, channel);
  await channelButton(page, channel).click();

  const memberName = uniqueName("Present");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, channel).click();

    // Owner refetches /users (reload) to pick up the newly-joined member,
    // who should then show as online in the member list.
    await page.reload();
    await expectInHub(page);
    await channelButton(page, channel).click();
    const row = page.locator("li.user-list-item", { hasText: memberName });
    await expect(row).toBeVisible({ timeout: 10000 });
    // Online rows are not tagged .offline.
    await expect(row).not.toHaveClass(/offline/);

    // Member disconnects → owner sees them flip offline live (member_offline
    // WS event flips an already-known user without a refetch).
    await context.close();
    await expect(row).toHaveClass(/offline/, { timeout: 15000 });
  } finally {
    if (context.pages().length) await context.close();
  }
});
