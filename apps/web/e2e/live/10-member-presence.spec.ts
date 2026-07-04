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

  // Baseline member-row count before anyone else joins. (The responsive
  // shell renders the list twice, so counts are consistent but doubled —
  // compare relative counts, and match live appearance by count rather than
  // name, since a brand-new member's display name can lag one refetch.)
  const rows = page.locator("li.user-list-item");
  const before = await rows.count();

  const memberName = uniqueName("Present");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    await channelButton(member, channel).click();

    // The newly-joined member appears in the owner's list LIVE (no reload):
    // onMemberOnline refetches /users when it sees an unknown pubkey.
    await expect.poll(async () => rows.count(), { timeout: 15000 }).toBeGreaterThan(before);

    // Member disconnects → owner sees an offline row appear (member_offline
    // flips the now-known user). Fresh DB → the member is the only one who
    // can be offline here.
    await context.close();
    await expect(page.locator("li.user-list-item.offline").first()).toBeVisible({ timeout: 15000 });
  } finally {
    if (context.pages().length) await context.close();
  }
});
