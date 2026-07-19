import { test, expect } from "@playwright/test";
import { channelButton, createChannel, expectInHub, newMemberPage, uniqueName } from "./helpers/live";

// P10 — member list refresh + presence: a named member showing up online
// LIVE, flipping to offline when they disconnect, and the away/DND/custom
// status picker (footer identity → status menu; hub-synced over
// set_status/member_status).

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

// Web's presence picker is Online/Away/DND/Invisible only — the free-text
// custom status was deliberately removed 2026-07-12 (decisions.md "Presence:
// Invisible + 'clear after' TTL; custom-text status removed"); the
// presence_custom plumbing stays dormant for desktop. So this asserts the
// DND state propagates live, without custom text.
test("status picker: member goes DND; others see the dot live", async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expectInHub(page);

  const memberName = uniqueName("Dnd");
  const { context, page: member } = await newMemberPage(browser, memberName);
  try {
    // Member opens the footer status picker and goes DND.
    await member.locator(".user-identity-details").click();
    const menu = member.locator(".status-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Do Not Disturb" }).click();
    await expect(menu).not.toBeVisible();

    // Member's own footer reflects it (dot).
    await expect(member.locator(".user-identity .user-status-dot.status-dnd")).toBeVisible();

    // The owner's member list shows the DND dot live.
    const memberRow = page.locator("li.user-list-item", { hasText: memberName });
    await expect(memberRow.locator(".status-dot.dnd")).toBeVisible({ timeout: 15000 });

    // Back to online, again live for the owner.
    await member.locator(".user-identity-details").click();
    await member.locator(".status-menu").getByRole("button", { name: "Online", exact: true }).click();
    await expect(memberRow.locator(".status-dot.online")).toBeVisible({ timeout: 15000 });
  } finally {
    await context.close();
  }
});
